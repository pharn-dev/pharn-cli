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

// SKILLS_VERSION reading — pharn-oss ships a root `SKILLS_VERSION` file in place
// of a manifest.json, so the archetype flow (init/status/update) reads the
// version from here. Untrusted (P2): every value is trimmed and VERSION_RE-
// validated before use/persist. One axis (P3): obtaining the skills version.

const RAW = 'https://raw.githubusercontent.com';
// A version string is ~50 characters; 1KB is generous and still bounds the read.
const MAX_MIN_CLI_BYTES = 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Read + validate `SKILLS_VERSION` from a fetched clone. Missing file is an
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
// MIN_CLI — the OPTIONAL forward-compatibility handshake, read from the same
// clone root as SKILLS_VERSION.
//
// It deliberately does NOT mirror readSkillsVersion's throw, and that asymmetry
// is the point. SKILLS_VERSION is REQUIRED: a missing or malformed one is an
// upstream packaging bug worth surfacing loudly. MIN_CLI is OPTIONAL, so "no
// constraint" is ALREADY a legal state — upstream ships none today. Meanwhile a
// throw here would become exit(1) in every command (add.ts turns any throw inside
// its try into `{kind:'error'}`; update.ts and init.ts turn it into a `failure`),
// so ONE upstream typo in a one-line file would brick init/add/update fleet-wide:
// the exact outage this handshake exists to remove, re-entered through the lever
// meant to prevent it.
//
// Tolerating a malformed value costs nothing an absent file does not already
// cost: whoever can mistype the file can also delete it.
// ---------------------------------------------------------------------------

export interface MinCliRead {
  // The well-formed minimum CLI version upstream declares, or `null` for "no
  // constraint" (absent, unreadable, or malformed).
  version: string | null;
  // A named reason when a PRESENT file could not be used. `null` when the file is
  // absent (the normal case — silent) or was read successfully.
  warning: string | null;
}

/**
 * Read the optional `MIN_CLI` file from a fetched clone. Never throws: absent →
 * no constraint and silent; unreadable or malformed → no constraint PLUS a named
 * warning (P5 — reported, never a silent skip, and never a hard failure).
 */
export function readMinCli(repoDir: string): MinCliRead {
  const path = safeJoin(repoDir, MIN_CLI_FILE);

  // ONE descriptor, opened once and read once. Not `existsSync` + `readFileSync`
  // and not `statSync` + `readFileSync`: both check one file and then read
  // whatever is at that name afterwards, which is a TOCTOU race on an untrusted
  // clone directory. Opening first and reading from the SAME fd means the bytes
  // that arrive are the bytes of the file that was opened.
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch (err) {
    // ENOENT is the NORMAL case and is SILENT: MIN_CLI is optional and upstream
    // ships none today, so "absent" means "no constraint", not "something is
    // wrong". Every other open failure is a present-but-unusable file, which is
    // still no constraint — but named (P5).
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: null, warning: null };
    }
    return { version: null, warning: unusableMinCli(err) };
  }

  let raw: string;
  try {
    // Bounded BY CONSTRUCTION rather than by a prior size check: at most
    // MAX_MIN_CLI_BYTES + 1 bytes are ever allocated or read, whatever the file's
    // real size. Reading the extra byte is what distinguishes "exactly at the
    // cap" from "over it". A version string is ~50 characters, so anything above
    // the cap is not a version by any reading.
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
    // A directory at the path (EISDIR), a permission error, a mid-clone
    // corruption.
    return { version: null, warning: unusableMinCli(err) };
  } finally {
    closeSync(fd);
  }

  const value = raw.trim();
  // VERSION_RE is anchored, so control characters and any injected payload fail
  // it — the untrusted bytes are NEVER echoed back into the warning (P2).
  if (!VERSION_RE.test(value)) {
    return {
      version: null,
      warning: `${MIN_CLI_FILE} in the fetched repo is not a valid version; continuing without a minimum-version constraint.`,
    };
  }
  return { version: value, warning: null };
}

// The one wording for "the file is there but unusable". Deliberately reports the
// ERROR class only, never the file's bytes — those are untrusted (P2).
function unusableMinCli(err: unknown): string {
  const code =
    (err as NodeJS.ErrnoException | undefined)?.code ??
    (err instanceof Error ? err.name : 'unknown error');
  return `${MIN_CLI_FILE} in the fetched repo could not be read (${code}); continuing without a minimum-version constraint.`;
}

/**
 * Build the "the network did not get us there" rethrower for one URL.
 *
 * Applied to the two NETWORK-ORIGIN phases only — the connect and the body read.
 * Offline, undici rejects with a bare `TypeError: fetch failed` whose real
 * diagnosis (`getaddrinfo ENOTFOUND raw.githubusercontent.com`) sits unprinted
 * in `err.cause`; the 8s abort rejects with `This operation was aborted`.
 * Neither names a host, a URL, or a next step, and both consumers print
 * `err.message` verbatim. Mirrors `commands/init.ts`'s "Could not reach …"
 * phrasing so the CLI has one voice.
 *
 * `{ cause: err }` keeps the original reachable, so `PHARN_DEBUG=1` still dumps
 * exactly what the runtime threw.
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
 * Fetch the latest `SKILLS_VERSION` from `@main` without cloning — the
 * lightweight currency check `status --no-drift` / `update` uses. Applies the
 * three network guards (redirect:'error', an 8s timeout, a 256KB body cap) and
 * validates the result (P2).
 *
 * The two guards that CAN cover the body now do: the timer is cleared only after
 * the read settles, and the cap is counted in wire bytes while the body streams.
 * (`redirect: 'error'` is a header-phase guard by nature — it is unchanged, and
 * it was never the one that stopped short.) Every failure THROWS — no default,
 * no null — because both consumers print the message and exit(1)
 * (`commands/update.ts`, `commands/status.ts`).
 */
export async function fetchRemoteSkillsVersion(): Promise<string> {
  const url = `${RAW}/${REPO}/${REPO_BRANCH}/${SKILLS_VERSION_FILE}`;
  const unreachable = rethrowUnreachable(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // ONE try around the fetch AND the body read — the timer shape `fetchCommitSha`
  // already uses (`lib/repo.ts`). `fetch()` resolves as soon as HEADERS arrive, so
  // a `finally` that closes before the body is consumed disarms the abort exactly
  // where it is needed: a server that dribbles bytes then runs until undici's
  // 300s inter-chunk bodyTimeout with no pharn timer armed at all.
  //
  // Only the SHAPE is mirrored. `fetchCommitSha` swallows every failure to `null`
  // (best-effort provenance, LIMITS.md §1b/§3b); this function must keep throwing.
  try {
    // `.catch` on the EXPRESSION, not a `try` around the block: the wrap must
    // cover this rejection and nothing thrown after it resolves, or the three
    // deliberate throws below (non-ok status, the two cap refusals,
    // assertSafeString) get re-labelled as transport failures.
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
    }).catch(unreachable);
    if (!res.ok) {
      throw new Error(
        `SKILLS_VERSION fetch failed (${res.status}) from ${url}`,
      );
    }
    // ADVISORY (P0), and backstopped below — never the guard itself.
    // `content-length` is the remote's own claim: a chunked response omits it
    // entirely (`Number(null)` is `0`, which sails through this compare), and a
    // hostile server is free to declare a small lie. It buys exactly one thing —
    // an HONESTLY declared oversize is refused before a single byte is read.
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new Error(
        `SKILLS_VERSION too large (${declared} bytes) from ${url}`,
      );
    }
    const text = await readCappedBody(res, url, unreachable);
    return assertSafeString(text.trim(), SKILLS_VERSION_FILE, VERSION_RE);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a response body under a hard byte cap, counted on the wire as it streams.
 *
 * Not `res.text()` + a length check: that buffers the WHOLE body first (so the
 * cap arrives after the damage) and `String.length` counts UTF-16 code units,
 * which a body of 3-byte characters clears at roughly three times the cap.
 *
 * What the cap guarantees, stated exactly: the read STOPS the first time the
 * running total exceeds MAX_BODY_BYTES. The compare necessarily runs after a
 * chunk has been handed to us, so at most one chunk beyond the cap is ever held,
 * and that chunk's size is the runtime's (undici sizes them from a socket read),
 * not pharn's. It bounds accumulation across chunks — not peak allocation.
 */
async function readCappedBody(
  res: Response,
  url: string,
  unreachable: (err: unknown) => never,
): Promise<string> {
  // A bodyless response (a 204, or `new Response(null)`) reads as empty text and
  // then fails VERSION_RE downstream — the same outcome `res.text()` produced.
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // FABLE 4.6: the wrap covers this read, not just the fetch call — since the
  // streaming rewrite the 8s abort surfaces HERE rather than out of
  // `await fetch(...)`, so a wrap on the fetch expression alone would leave
  // exactly the case the wrap exists for propagating raw.
  //
  // The reader is cancelled on the cap refusal only. An abort or a transport
  // error mid-body leaves it un-cancelled, which is benign ONLY because both
  // callers exit(1) on the throw — a caller property, not a local one. A future
  // non-exiting caller needs a cancel on those paths too.
  for (;;) {
    const { done, value } = await reader.read().catch(unreachable);
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      // Release the socket rather than draining a body already refused. A cancel
      // failure must never mask the refusal, hence the ignore.
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
