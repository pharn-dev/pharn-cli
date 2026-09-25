import { withDeadline } from './deadline.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, REPO_BRANCH } from './constants.js';
import { onFatalSignal } from './fatal-signal.js';
import { extractTarGz } from './tar-extract.js';
import { assertSafeString, COMMIT_RE } from './validate.js';

const API = 'https://api.github.com';
const CODELOAD = 'https://codeload.github.com';
const FETCH_TIMEOUT_MS = 8000;
// The clone timeout has to cover a ~2.5 MB streamed body, not just the response
// headers, so it is deliberately not the 8 s the two metadata fetches use.
const CLONE_TIMEOUT_MS = 60_000;
// Caps on both sides of the gunzip. codeload sends NO content-length, so the
// compressed cap is enforced by counting bytes as they stream; the decompressed
// cap is what bounds a zip bomb, which neither the header nor the archive size
// would.
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

// ---------------------------------------------------------------------------
// Temp-clone lifecycle backstop.
//
// Every caller disposes of its clone in a `finally`, and that stays the primary
// mechanism — this is a net underneath it, never a replacement. The net exists
// because two real exits never reach a `finally`:
//
//   1. `process.exit()`. Node does not run `finally` on it. This is not a corner
//      case: while a clack spinner is up — which is exactly the clone window —
//      @clack/core's block() raw-modes stdin, so Ctrl-C arrives as a KEYPRESS,
//      not a signal, and clack calls process.exit(0). So the longest prompt-free
//      window in the CLI ends by leaking the clone AND reporting success.
//   2. A signal. Nothing in pharn handled one, so default disposition applied —
//      or worse, in a piped run @clack/prompts' own SIGINT listener printed and
//      returned, swallowing the signal entirely. The signal half now lives in
//      lib/fatal-signal.ts, shared with the project lock, which has to be
//      released on the same signals.
//
// Registered dirs are removed synchronously, because an `exit` listener may not
// await.
// ---------------------------------------------------------------------------

/** Clone dirs this process currently owns. Empty once every caller has disposed. */
const liveClones = new Set<string>();
let handlersInstalled = false;

/** A handler must never throw — a failure here would replace the real exit reason. */
function rmQuiet(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function installCleanupHandlers(): void {
  // Once-only: `pharn update` calls fetchRepo more than once per run, and a
  // listener per call would eventually trip MaxListenersExceededWarning.
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('exit', () => {
    for (const dir of liveClones) rmQuiet(dir);
  });

  // Registered for the life of the process — the set it drains is empty
  // whenever no clone is live. fatal-signal.ts re-raises afterwards, so the exit
  // status stays truthful (130 / 143).
  onFatalSignal(() => {
    for (const dir of liveClones) rmQuiet(dir);
    liveClones.clear();
  });
}

export interface FetchedRepo {
  dir: string;
  // The commit the tree was pinned to — recorded verbatim as pharn.config.json
  // `commit`. It is EITHER the resolved SHA (the tarball was fetched at exactly
  // it) OR `null` (the SHA could not be resolved — offline / GitHub rate-limit —
  // so the fetch floated REPO_BRANCH, the documented degraded mode, LIMITS.md
  // §3b). A non-null value is validated against COMMIT_RE at the boundary
  // (fetchRepo) — a full 40-hex sha — so a malformed / hostile API response is
  // rejected, never recorded. It is NEVER a non-null SHA that differs from what
  // was fetched: the same value is both the last URL segment and this field, so
  // the record cannot silently lie.
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
 * ONE resolve, then a direct download. The SHA that `fetchCommitSha` returns is
 * the last segment of `codeload.github.com/<repo>/tar.gz/<sha>`; nothing
 * re-resolves the ref. That matters beyond the saved round trip: the previous
 * implementation handed the already-resolved SHA to a dependency that resolved
 * the same ref again and matched the result only against CURRENT ref tips, so a
 * push landing between pharn's resolve and the dependency's failed the whole
 * command. codeload serves any commit, tip or not, so an upstream push mid-fetch
 * now yields exactly the pinned SHA rather than an error — which is at least as
 * honest, since `sha` and the fetched bytes still come from one value.
 *
 * When the SHA cannot be resolved, fall back to `refs/heads/<REPO_BRANCH>`
 * (LIMITS.md §3b — the install still proceeds; `sha` is null). Provenance is
 * by-SHA, NOT cryptographic (LIMITS.md §1b): a compromised upstream serving a
 * valid-shaped tree at that SHA still passes. Trust is provenance + the
 * path/network floor, never signature verification.
 *
 * The clone is registered in a process-wide set that `exit`/`SIGINT`/`SIGTERM`
 * handlers drain, so an interrupted run cannot leak it — see the block above
 * `FetchedRepo`. That is a backstop under each caller's `finally`, not a
 * replacement for it.
 *
 * The network floor is the same three guards `lib/skills-version.ts` carries —
 * `redirect: 'error'`, a timeout cleared in `finally`, and a body cap — and the
 * path floor is `lib/tar-extract.ts`, whose rejections are pharn's own rather
 * than a dependency's. pharn invokes no `git` binary and keeps no tarball cache:
 * every fetch is a fresh download into a fresh temp dir.
 */
export async function fetchRepo(): Promise<FetchedRepo> {
  // The sha is network-derived (fetchCommitSha reads it from the GitHub commits
  // API) and untrusted (P2): a non-null value MUST be a full 40-hex commit SHA
  // before it becomes a URL segment OR is recorded as pharn.config.json
  // `commit`. Reject a malformed one loudly (same failure style as
  // skills-version.ts) rather than paste garbage into a URL or record it as
  // provenance; `null` is the documented degraded mode (LIMITS.md §3b) and
  // passes through. One boundary guard covers every downstream sink (the URL
  // below + the three config-assembly writers).
  const rawSha = await fetchCommitSha();
  const sha =
    rawSha === null ? null : assertSafeString(rawSha, 'commit SHA', COMMIT_RE);
  // Pin to the resolved SHA; else float the branch (LIMITS.md §3b degraded mode).
  const ref = sha ?? `refs/heads/${REPO_BRANCH}`;
  installCleanupHandlers();
  const dir = mkdtempSync(join(tmpdir(), 'pharn-'));
  liveClones.add(dir);
  try {
    const archive = await downloadArchive(ref);
    extractTarGz(archive, dir, {
      maxEntries: MAX_ENTRIES,
      maxTotalBytes: MAX_EXTRACTED_BYTES,
    });
  } catch (err) {
    // Extraction is not transactional, so a partially-written tree must never
    // be returned. Callers treat a fetchRepo throw as fatal.
    liveClones.delete(dir);
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return {
    dir,
    sha,
    cleanup: () => {
      // Deregister before removing: a disposed dir must never be resurrected in
      // the registry, or a later handler run would rm a path this process no
      // longer owns. mkdtemp names collide only by chance, and "only by chance"
      // is not a guard.
      liveClones.delete(dir);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Download the repo tarball at `ref` into memory, bounded on both time and
 * size. `ref` is either a COMMIT_RE-validated SHA or the literal
 * `refs/heads/<branch>` — never user input.
 */
async function downloadArchive(ref: string): Promise<Buffer> {
  const url = `${CODELOAD}/${REPO}/tar.gz/${ref}`;
  // withDeadline, not a bare abort timer: on Node 20/22 the abort may never
  // reach the body stream (lib/deadline.ts), and this read is multi-megabyte.
  return withDeadline(
    CLONE_TIMEOUT_MS,
    () =>
      new Error(
        `Timed out downloading ${url} after ${CLONE_TIMEOUT_MS / 1000}s.`,
      ),
    async (signal) => {
      const res = await fetch(url, { redirect: 'error', signal });
      if (!res.ok) {
        // Released, not left streaming: an unread body holds its socket, and
        // with it the process. Harmless today only because every caller exits 1
        // on this throw — a property of the callers, so the release is made here.
        await discardBody(res);
        throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error(`Failed to download ${url}: empty response body`);
      }
      // An explicit reader, cancelled by OUR listener on OUR signal, so the
      // socket is released at the deadline even when undici drops the abort.
      const reader = res.body.getReader();
      signal.addEventListener('abort', () => {
        reader.cancel().catch(() => undefined);
      });
      // codeload sends no content-length, so the cap is a running count over
      // the stream rather than a header check.
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        total += buf.byteLength;
        if (total > MAX_ARCHIVE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error(
            `Refusing ${url}: archive exceeds ${MAX_ARCHIVE_BYTES} bytes.`,
          );
        }
        chunks.push(buf);
      }
      if (signal.aborted) {
        throw new Error(
          `Timed out downloading ${url} after ${CLONE_TIMEOUT_MS / 1000}s.`,
        );
      }
      return Buffer.concat(chunks);
    },
  );
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
  try {
    // Same hard deadline as the download (lib/deadline.ts); a timeout is just
    // one more failure that degrades to `null`.
    return await withDeadline(
      FETCH_TIMEOUT_MS,
      () => new Error(`Timed out resolving ${url}`),
      async (signal) => {
        const res = await fetch(url, {
          redirect: 'error',
          signal,
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        // A null SHA is a degraded mode, not an exit: the command carries on and
        // finishes, and index.ts never calls process.exit on success. So a body
        // left streaming here — a 403 page, or a 2xx still arriving at the
        // deadline — kept the process alive after the command's last line was
        // printed (measured: 30 s for a dripping 403). Neither may outlive this
        // function.
        if (!res.ok) {
          await discardBody(res);
          return null;
        }
        const body = JSON.parse(await readText(res, signal)) as {
          sha?: unknown;
        };
        return typeof body.sha === 'string' ? body.sha : null;
      },
    );
  } catch {
    return null;
  }
}

/** Release a response body that will not be read. Never throws. */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* already errored or locked: there is nothing left to release */
  }
}

/**
 * The whole body as UTF-8, read through OUR reader and cancelled by OUR
 * listener on OUR signal — downloadArchive's pattern. `res.json()` has no
 * reader pharn can cancel, and on Node 20/22 the abort may never reach the body
 * stream (lib/deadline.ts), so a body still streaming at the deadline outlived
 * the command.
 */
async function readText(res: Response, signal: AbortSignal): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const cancel = (): void => {
    reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
