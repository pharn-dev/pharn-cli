import { withDeadline } from './deadline.js';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
} from 'node:fs';
import {
  MIN_CLI_FILE,
  REPO,
  REPO_BRANCH,
  SKILLS_VERSION_FILE,
} from './constants.js';
import {
  assertSafeString,
  ManifestValidationError,
  safeJoin,
  VERSION_RE,
} from './validate.js';

// SKILLS_VERSION reading — pharn-oss ships a root `SKILLS_VERSION` file, which
// the archetype flow reads in place of a manifest. Untrusted: every value is
// trimmed and VERSION_RE-validated before use.

const RAW = 'https://raw.githubusercontent.com';
// A version string is ~50 characters; 1KB is generous and still bounds the read.
const MAX_MIN_CLI_BYTES = 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Read + validate `SKILLS_VERSION` from a fetched clone. A missing file is an
 * upstream packaging bug — surfaced, not defaulted.
 */
export function readSkillsVersion(repoDir: string): string {
  const path = safeJoin(repoDir, SKILLS_VERSION_FILE);
  if (!existsSync(path)) {
    throw new ManifestValidationError(
      `${SKILLS_VERSION_FILE} is missing in the fetched repo.`,
    );
  }
  return assertSafeString(
    readFileSync(path, 'utf8').trim(),
    SKILLS_VERSION_FILE,
    VERSION_RE,
  );
}

// ---------------------------------------------------------------------------
// MIN_CLI — the OPTIONAL forward-compatibility handshake, beside SKILLS_VERSION.
//
// Deliberately NOT readSkillsVersion's throw: "no constraint" is already a
// legal state, and a throw here becomes exit(1) in init/add/update, so one
// upstream typo would brick every install — the outage this handshake exists
// to prevent. Tolerating a malformed value costs nothing an absent file does
// not: whoever can mistype the file can also delete it.
// ---------------------------------------------------------------------------

export interface MinCliRead {
  // The well-formed minimum CLI version, or `null` for "no constraint".
  version: string | null;
  // A named reason when a PRESENT file could not be used; `null` otherwise.
  warning: string | null;
}

/**
 * Read the optional `MIN_CLI` file from a fetched clone. Never throws: absent →
 * no constraint, silently; unreadable or malformed → no constraint PLUS a named
 * warning.
 */
export function readMinCli(repoDir: string): MinCliRead {
  const path = safeJoin(repoDir, MIN_CLI_FILE);

  // ONE descriptor, so the read below is bounded without a size check (the
  // clone is pharn's own private temp dir, so there is no race).
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch (err) {
    // ENOENT is the NORMAL case and SILENT. Any other open failure is a
    // present-but-unusable file: still no constraint, but named.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: null, warning: null };
    }
    return { version: null, warning: unusableMinCli(err) };
  }

  let raw: string;
  try {
    // Bounded by construction: at most MAX_MIN_CLI_BYTES + 1 bytes are read;
    // the extra byte tells "at the cap" from "over it".
    const buf = Buffer.alloc(MAX_MIN_CLI_BYTES + 1);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    if (bytes > MAX_MIN_CLI_BYTES) {
      return {
        version: null,
        warning: `${MIN_CLI_FILE} in the fetched repo is too large to be a version; continuing without a minimum-version constraint.`,
      };
    }
    raw = buf.subarray(0, bytes).toString('utf8');
  } catch (err) {
    // EISDIR, a permission error, a corrupt clone.
    return { version: null, warning: unusableMinCli(err) };
  } finally {
    closeSync(fd);
  }

  const value = raw.trim();
  // VERSION_RE is anchored, and the untrusted bytes are never echoed back.
  if (!VERSION_RE.test(value)) {
    return {
      version: null,
      warning: `${MIN_CLI_FILE} in the fetched repo is not a valid version; continuing without a minimum-version constraint.`,
    };
  }
  return { version: value, warning: null };
}

// "Present but unusable": the ERROR class only, never the untrusted bytes.
function unusableMinCli(err: unknown): string {
  const code =
    (err as NodeJS.ErrnoException | undefined)?.code ??
    (err instanceof Error ? err.name : 'unknown error');
  return `${MIN_CLI_FILE} in the fetched repo could not be read (${code}); continuing without a minimum-version constraint.`;
}

/**
 * Build the "the network did not get us there" rethrower for one URL, applied
 * to the connect and the body read only. Offline, undici rejects with a bare
 * `TypeError: fetch failed` (the diagnosis hides in `err.cause`) and the abort
 * with `This operation was aborted` — neither names a host or a next step, and
 * both consumers print `err.message`. `{ cause: err }` keeps the original for
 * `PHARN_DEBUG=1`.
 */
function rethrowUnreachable(url: string): (err: unknown) => never {
  return (err) => {
    const message = err instanceof Error ? err.message : String(err);
    const inner = err instanceof Error ? err.cause : undefined;
    const cause =
      inner === undefined
        ? null
        : inner instanceof Error
          ? inner.message
          : String(inner);
    throw new Error(
      `Could not reach ${url}: ${message}${cause ? ` (${cause})` : ''}`,
      { cause: err },
    );
  };
}

/**
 * Fetch the latest `SKILLS_VERSION` from `@main` without cloning — the `main`
 * channel's currency check. Guarded by `redirect: 'error'`, an 8s deadline over
 * fetch AND body, and a 256KB cap counted on the wire; the result is validated.
 * Every failure THROWS: both consumers print the message and exit(1).
 */
export async function fetchRemoteSkillsVersion(): Promise<string> {
  const url = `${RAW}/${REPO}/${REPO_BRANCH}/${SKILLS_VERSION_FILE}`;
  const unreachable = rethrowUnreachable(url);
  // ONE deadline around the fetch AND the body read: `fetch()` resolves at the
  // headers, so a timer stopped earlier is disarmed exactly where needed.
  // withDeadline also rejects on its own (lib/deadline.ts). Only the SHAPE is
  // shared with `fetchCommitSha`, which swallows failures to `null`; this
  // function must keep throwing.
  return withDeadline(
    FETCH_TIMEOUT_MS,
    () =>
      new Error(
        `Could not reach ${url}: This operation was aborted (timed out after ${FETCH_TIMEOUT_MS / 1000}s)`,
      ),
    async (signal) => {
      // `.catch` on the EXPRESSION, not a `try` around the block, so the
      // deliberate throws below are not re-labelled as transport failures.
      const res = await fetch(url, { redirect: 'error', signal }).catch(
        unreachable,
      );
      if (!res.ok) {
        throw new Error(
          `SKILLS_VERSION fetch failed (${res.status}) from ${url}`,
        );
      }
      // ADVISORY, backstopped below: `content-length` is the remote's own claim
      // (absent when chunked, free to lie). It only refuses an honestly declared
      // oversize before a byte is read.
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        throw new Error(
          `SKILLS_VERSION too large (${declared} bytes) from ${url}`,
        );
      }
      const text = await readCappedBody(res, url, unreachable, signal);
      return assertSafeString(text.trim(), SKILLS_VERSION_FILE, VERSION_RE);
    },
  );
}

/**
 * Read a response body under a hard byte cap, counted on the wire as it
 * streams — not `res.text()` + a length check, which buffers everything first
 * and counts UTF-16 units. The read stops the first time the total exceeds
 * MAX_BODY_BYTES, so at most one runtime-sized chunk beyond the cap is held:
 * it bounds accumulation, not peak allocation.
 */
async function readCappedBody(
  res: Response,
  url: string,
  unreachable: (err: unknown) => never,
  signal: AbortSignal,
): Promise<string> {
  // A bodyless response reads as empty text and then fails VERSION_RE.
  if (!res.body) return '';
  const reader = res.body.getReader();
  // Our own listener on our own signal: at the deadline the stream is cancelled
  // (socket released) even when undici does not forward the abort.
  signal.addEventListener('abort', () => {
    reader.cancel().catch(() => undefined);
  });
  const chunks: Uint8Array[] = [];
  let total = 0;
  // The wrap covers this read: the abort surfaces HERE, not out of
  // `await fetch(...)`. The reader is cancelled on the cap refusal only; an
  // abort or transport error mid-body leaves it un-cancelled, benign only
  // because both callers exit(1) on the throw — a non-exiting caller needs a
  // cancel on those paths too.
  for (;;) {
    const { done, value } = await reader.read().catch(unreachable);
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      // Release the socket; a cancel failure must never mask the refusal.
      await reader.cancel().catch(() => undefined);
      throw new Error(`SKILLS_VERSION too large (${total} bytes) from ${url}`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
