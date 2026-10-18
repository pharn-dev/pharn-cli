import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

// ---------------------------------------------------------------------------
// The one reader for the files pharn keeps in a project — pharn.records.json,
// pharn.config.json and .pharn.lock. It returns their bytes, `absent`, or
// `unusable` with a fixed reason, and it never hangs and never reads without
// bound. `readJsonBounded` adds the JSON parse most callers do next.
//
// Why not `readFileSync`: on a FIFO, a plain open(2) waits for a writer that
// never comes, so one planted at any of these paths hung every command that
// read it — `update` and a re-run `init` while holding the project lock, which
// in turn refused every other pharn command in the project. On a device (a
// symlink to /dev/zero) it read until memory ran out. The readers of
// user-adjacent files already had this shape (lib/hook-wiring.ts for the
// settings files, lib/detect-archetype.ts for package.json); these three never
// got it.
//
// The shape, the same as theirs: ONE descriptor, opened `O_NONBLOCK` (absent on
// win32, where the flag is simply not set), so opening a FIFO returns at once;
// `fstat` on that descriptor must show a regular file within the cap; the bytes
// are read from that same descriptor, so the file checked is the file read. A
// symlinked FILE is followed, as a plain read follows it — these are the user's
// own files — and its target is held to the same checks.
//
// Every failure is a value, never a throw: callers already have an "unreadable"
// outcome (records → `invalid`, config → `null`, lock → presumed live, then
// broken), and this only routes more cases into it. Determinism (P5): a type
// check and a size compare. Trust (P2): bytes are returned as data; only the
// fixed reason strings below ever reach a message.
// ---------------------------------------------------------------------------

/** The most bytes pharn reads from one of its own project files. */
export const MAX_LOCAL_FILE_BYTES = 16 * 1024 * 1024;

export type BoundedRead =
  | { kind: 'ok'; bytes: Buffer }
  | { kind: 'absent' }
  | {
      kind: 'unusable';
      // An errno, or `not-a-file` / `too-large`. A directory reports `EISDIR`,
      // the errno a plain read gives it, so a value recorded before this reader
      // existed (a config fingerprint) keeps its meaning.
      code: string;
      // Completes "<file> …" in a message: fixed text, never file content.
      reason: string;
    };

const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);
const NOT_A_FILE = 'is not a regular file';

/** Read `path` if it is a regular file of at most `maxBytes` bytes. */
export function readBoundedFile(
  path: string,
  maxBytes: number = MAX_LOCAL_FILE_BYTES,
): BoundedRead {
  let fd: number;
  try {
    fd = openSync(path, OPEN_FLAGS);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'EUNKNOWN';
    if (code === 'ENOENT') return { kind: 'absent' };
    // Windows refuses to open a directory at all (EISDIR), where POSIX opens it
    // and the fstat below says so: same file, same reason, either way.
    if (code === 'EISDIR') {
      return { kind: 'unusable', code, reason: NOT_A_FILE };
    }
    return { kind: 'unusable', code, reason: `could not be read (${code})` };
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      return {
        kind: 'unusable',
        code: stat.isDirectory() ? 'EISDIR' : 'not-a-file',
        reason: NOT_A_FILE,
      };
    }
    const tooLarge: BoundedRead = {
      kind: 'unusable',
      code: 'too-large',
      reason: `is larger than ${formatBytes(maxBytes)}`,
    };
    if (stat.size > maxBytes) return tooLarge;
    // Read to EOF, never past the cap: the file can grow after the fstat.
    const chunks: Buffer[] = [];
    let total = 0;
    const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      total += n;
      if (total > maxBytes) return tooLarge;
      chunks.push(Buffer.from(chunk.subarray(0, n)));
    }
    return { kind: 'ok', bytes: Buffer.concat(chunks, total) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'EUNKNOWN';
    return { kind: 'unusable', code, reason: `could not be read (${code})` };
  } finally {
    closeSync(fd);
  }
}

export type BoundedJsonRead =
  | Exclude<BoundedRead, { kind: 'ok' }>
  | { kind: 'ok'; value: unknown }
  // The bytes were read but are not JSON. `error` is `JSON.parse`'s own throw,
  // carried for a caller that derives a location from it (pharn-config.ts's
  // `parseLocation`); its message can quote file bytes, so it is never printed
  // as is.
  | { kind: 'invalid-json'; error: unknown };

/**
 * `readBoundedFile`, then `JSON.parse` of the bytes as UTF-8. Never throws: the
 * read's `absent` / `unusable` pass through unchanged, a parse failure is
 * `invalid-json`, and the parsed value is returned as `unknown` — every caller
 * keeps its own shape check and its own failure wording.
 */
export function readJsonBounded(
  path: string,
  maxBytes: number = MAX_LOCAL_FILE_BYTES,
): BoundedJsonRead {
  const read = readBoundedFile(path, maxBytes);
  if (read.kind !== 'ok') return read;
  try {
    return { kind: 'ok', value: JSON.parse(read.bytes.toString('utf8')) };
  } catch (error) {
    return { kind: 'invalid-json', error };
  }
}

function formatBytes(n: number): string {
  const mib = 1024 * 1024;
  return n % mib === 0 && n >= mib ? `${n / mib} MiB` : `${n} bytes`;
}
