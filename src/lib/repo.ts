import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import degit from 'degit';
import { REPO, REPO_BRANCH } from './constants.js';
import { assertSafeString, COMMIT_RE } from './validate.js';

const API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 8000;

export interface FetchedRepo {
  dir: string;
  // The commit the tree was pinned to — recorded verbatim as pharn.config.json
  // `commit`. It is EITHER the resolved SHA (degit was pinned to exactly it) OR
  // `null` (the SHA could not be resolved — offline / GitHub rate-limit — so the
  // fetch floated REPO_BRANCH, the documented degraded mode, LIMITS.md §3b). A
  // non-null value is validated against COMMIT_RE at the boundary (fetchRepo) — a
  // full 40-hex sha — so a malformed / hostile API response is rejected, never
  // recorded. It is NEVER a non-null SHA that differs from what was fetched: the
  // same value drives the degit ref and this field, so the record cannot silently lie.
  sha: string | null;
  cleanup: () => void;
}

/**
 * Clone the whole pharn-oss repo into a fresh temp directory, PINNED to the
 * resolved commit SHA so the recorded provenance matches the fetched bytes
 * (closing the separate-resolve/separate-fetch TOCTOU where a push between the
 * two reads made `commit` disagree with the tree). The caller derives the
 * capability index from the clone (lib/capability-index.ts), records `sha` as
 * `commit`, then calls cleanup().
 *
 * When the SHA cannot be resolved, fall back to REPO_BRANCH (LIMITS.md §3b — the
 * install still proceeds; `sha` is null). Provenance is by-SHA, NOT
 * cryptographic (LIMITS.md §1b): a full SHA is a valid degit ref
 * (github.com/<repo>/archive/<sha>.tar.gz). degit resolves the ref through THREE
 * tiers, not `git ls-remote` alone: pure-JS `listServerRefs`, then
 * `getRemoteInfo2`, and only then a spawned `git ls-remote --symref` — each tier
 * falling through on an EMPTY catch, so the git binary is a last resort and its
 * absence is not itself a failure. Either way, pinning to REPO_BRANCH's current
 * HEAD SHA fetches exactly it,
 * and if REPO_BRANCH moves mid-fetch degit's own resolution fails (the SHA is no
 * longer a ref tip) rather than fetching drift — but a compromised upstream
 * serving a valid-shaped tree at that SHA still passes; trust is provenance +
 * the path/network floor, never signature verification.
 */
export async function fetchRepo(): Promise<FetchedRepo> {
  // The sha is network-derived (fetchCommitSha reads it from the GitHub commits
  // API) and untrusted (P2): a non-null value MUST be a full 40-hex commit SHA
  // before it becomes the degit ref OR is recorded as pharn.config.json `commit`.
  // Reject a malformed one loudly (same failure style as skills-version.ts) rather
  // than feed garbage to degit or record it as provenance; `null` is the documented
  // degraded mode (LIMITS.md §3b) and passes through. One boundary guard covers
  // every downstream sink (the ref below + the three config-assembly writers).
  const rawSha = await fetchCommitSha();
  const sha =
    rawSha === null ? null : assertSafeString(rawSha, 'commit SHA', COMMIT_RE);
  // Pin to the resolved SHA; else float the branch (LIMITS.md §3b degraded mode).
  const ref = sha ?? REPO_BRANCH;
  const dir = mkdtempSync(join(tmpdir(), 'pharn-'));
  try {
    // `cache: false` is NOT no-cache — measured against degit@3.6.6, it governs
    // neither reuse nor writing. degit's download step runs entirely INSIDE
    // `if (!options.cache)`: it reuses an existing tarball at the cache path when
    // one is there, and otherwise mkdirs that path and downloads into it. So every
    // fetch leaves a SHA-named tarball plus map.json/access.json in a shared,
    // cross-project cache dir (darwin ~/Library/Caches/degit; linux
    // $XDG_CACHE_HOME ?? ~/.cache, then /degit; win32 %LOCALAPPDATA%/degit) — and
    // reuse is keyed by FILENAME, never a verified digest (THREAT-MODEL.md §4b).
    // The emitter also emits `warn` on three tar->`git clone` fallbacks; we
    // register no listener, so those are silently dropped HERE, not by degit.
    const emitter = degit(`${REPO}#${ref}`, {
      force: true,
      cache: false,
    });
    await emitter.clone(dir);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    dir,
    sha,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Best-effort: resolve the current commit SHA of the default branch so the fetch
 * can be pinned to it and it can be recorded in pharn.config.json. Returns null
 * on any failure (rate limit, offline, etc.) — the SHA is advisory provenance
 * (LIMITS.md §1b/§3b), never a cryptographic gate. The returned string is NOT
 * format-checked here; fetchRepo validates it against COMMIT_RE at the boundary
 * (a throw here would be swallowed to null by the catch — the wrong failure mode).
 */
export async function fetchCommitSha(): Promise<string | null> {
  const url = `${API}/repos/${REPO}/commits/${REPO_BRANCH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: unknown };
    return typeof body.sha === 'string' ? body.sha : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
