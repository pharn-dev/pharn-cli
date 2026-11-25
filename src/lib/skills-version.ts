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
import { FetchCappedError, fetchCapped } from './fetch-capped.js';
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

/**
 * Refuse a tree whose SKILLS_VERSION is not `expected`: the release check
 * (`fetchAt`, lib/repo.ts) and `verify-archive --expect-version` share it.
 * `refusal` words the message from the version found, so each caller keeps
 * its own wording; a missing or malformed file throws `readSkillsVersion`'s.
 */
export function assertSkillsVersion(
  repoDir: string,
  expected: string,
  refusal: (found: string) => string,
): void {
  const found = readSkillsVersion(repoDir);
  if (found !== expected) throw new ManifestValidationError(refusal(found));
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
 * Fetch the latest `SKILLS_VERSION` from `@main` without cloning — the `main`
 * channel's currency check, through `fetchCapped` (an 8s deadline over fetch
 * AND body, a 256KB cap counted on the wire); the result is validated. Every
 * failure THROWS: both consumers print the message and exit(1). A transport
 * failure or the deadline already reads `Could not reach <url>: …`; the
 * deliberate refusals (status, cap, value) keep their own wording.
 */
export async function fetchRemoteSkillsVersion(): Promise<string> {
  const url = `${RAW}/${REPO}/${REPO_BRANCH}/${SKILLS_VERSION_FILE}`;
  const got = await fetchCapped(url, {
    maxBytes: MAX_BODY_BYTES,
    ms: FETCH_TIMEOUT_MS,
  }).catch((err: unknown) => {
    if (err instanceof FetchCappedError && err.kind === 'too-large') {
      throw new Error(
        `SKILLS_VERSION too large (over ${MAX_BODY_BYTES} bytes) from ${url}`,
      );
    }
    throw err;
  });
  if (!got.ok) {
    throw new Error(`SKILLS_VERSION fetch failed (${got.status}) from ${url}`);
  }
  // A bodyless response reads as empty text and then fails VERSION_RE.
  return assertSafeString(
    got.body.toString('utf8').trim(),
    SKILLS_VERSION_FILE,
    VERSION_RE,
  );
}
