import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

// ---------------------------------------------------------------------------
// The one reader for the files pharn keeps in a project (pharn.records.json,
// pharn.config.json, pharn/.lock): bytes, `absent`, or `unusable` with a fixed
// reason — never a hang, never an unbounded read. `readJsonBounded` adds the
// parse.
//
// Why not `readFileSync`: opening a FIFO blocks forever (possibly while holding
// the project lock), and a device like /dev/zero reads until memory runs out.
// So: ONE descriptor opened `O_NONBLOCK`, `fstat`-checked as a regular file
// within the cap, read from that same descriptor. A symlinked FILE is followed
// (the user's own file) and held to the same checks. Every failure is a value,
// routed into each caller's existing "unreadable" outcome; only the fixed
// reason strings ever reach a message.
// ---------------------------------------------------------------------------

/** The most bytes pharn reads from one of its own project files. */
export const MAX_LOCAL_FILE_BYTES = 16 * 1024 * 1024;

export type BoundedRead =
  | { kind: 'ok'; bytes: Buffer }
  | { kind: 'absent' }
  | {
      kind: 'unusable';
      // An errno, or `not-a-file` / `too-large`. A directory reports `EISDIR`,
      // as a plain read does, so a recorded config fingerprint keeps its meaning.
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
    // Windows refuses to open a directory (EISDIR); POSIX opens it and the
    // fstat says so — same reason either way.
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
  // Not JSON. `error` is `JSON.parse`'s throw, for a caller that derives a
  // location from it; its message can quote file bytes, so never print it.
  | { kind: 'invalid-json'; error: unknown };

/**
 * `readBoundedFile`, then `JSON.parse` as UTF-8. Never throws; the value is
 * `unknown`, so every caller keeps its own shape check and wording.
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
