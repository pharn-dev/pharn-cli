import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import degit from 'degit';
import { REPO, REPO_BRANCH } from './constants.js';

const API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 8000;

export interface FetchedRepo {
  dir: string;
  // The commit the tree was pinned to — recorded verbatim as pharn.config.json
  // `commit`. It is EITHER the resolved SHA (degit was pinned to exactly it) OR
  // `null` (the SHA could not be resolved — offline / GitHub rate-limit — so the
  // fetch floated REPO_BRANCH, the documented degraded mode, LIMITS.md §3b). It
  // is NEVER a non-null SHA that differs from what was fetched: the same value
  // drives the degit ref and this field, so the record cannot silently lie.
  sha: string | null;
  cleanup: () => void;
}

/**
 * Clone the whole pharn-oss repo into a fresh temp directory, PINNED to the
 * resolved commit SHA so the recorded provenance matches the fetched bytes
 * (closing the separate-resolve/separate-fetch TOCTOU where a push between the
 * two reads made `commit` disagree with the tree). The caller reads
 * manifest.json + each module's installs from it, records `sha` as `commit`,
 * then calls cleanup().
 *
 * When the SHA cannot be resolved, fall back to REPO_BRANCH (LIMITS.md §3b — the
 * install still proceeds; `sha` is null). Provenance is by-SHA, NOT
 * cryptographic (LIMITS.md §1b): a full SHA is a valid degit ref
 * (github.com/<repo>/archive/<sha>.tar.gz). As degit resolves the ref via
 * `git ls-remote`, pinning to REPO_BRANCH's current HEAD SHA fetches exactly it,
 * and if REPO_BRANCH moves mid-fetch degit's own resolution fails (the SHA is no
 * longer a ref tip) rather than fetching drift — but a compromised upstream
 * serving a valid-shaped tree at that SHA still passes; trust is provenance +
 * the path/network floor, never signature verification.
 */
export async function fetchRepo(): Promise<FetchedRepo> {
  const sha = await fetchCommitSha();
  // Pin to the resolved SHA; else float the branch (LIMITS.md §3b degraded mode).
  const ref = sha ?? REPO_BRANCH;
  const dir = mkdtempSync(join(tmpdir(), 'pharn-'));
  try {
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
 * (LIMITS.md §1b/§3b), never a cryptographic gate.
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
