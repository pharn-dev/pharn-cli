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
 * Fetch the latest `SKILLS_VERSION` from `@main` without cloning — the
 * lightweight currency check `status --no-drift` / `update` uses. Applies the
 * three network guards (redirect:'error', an 8s timeout, a 256KB body cap) and
 * validates the result (P2).
 */
export async function fetchRemoteSkillsVersion(): Promise<string> {
  const url = `${RAW}/${REPO}/${REPO_BRANCH}/${SKILLS_VERSION_FILE}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`SKILLS_VERSION fetch failed (${res.status}) from ${url}`);
  }
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error(`SKILLS_VERSION too large (${declared} bytes) from ${url}`);
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error(
      `SKILLS_VERSION too large (${text.length} bytes) from ${url}`,
    );
  }
  return assertSafeString(text.trim(), SKILLS_VERSION_FILE, VERSION_RE);
}
