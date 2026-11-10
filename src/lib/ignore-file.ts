import { lstatSync } from 'node:fs';
import { readBoundedFile } from './bounded-read.js';
import { writeFileAtomic } from './atomic-write.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The mechanics pharn shares for the root ignore files it appends to
// (`.gitignore` — lib/gitignore.ts; `.prettierignore` — lib/prettierignore.ts).
// One axis (P3): reading, parsing and appending to a gitignore-syntax file.
// WHICH entries a file must hold, and when one counts as covered, stay with
// each caller — this module never decides coverage.
//
// APPEND-ONLY. The new bytes are the old bytes followed by pharn's block —
// never a decode/re-encode, never a reorder, never a removed line.
//
// Trust (P2): an ignore file is project content and may be hostile. It is read
// bounded (lib/bounded-read.ts) and only compared against fixed or validated
// strings; its text never reaches a terminal and never drives a path. The only
// write target is the fixed root file, replaced atomically — never written
// through a symlink or into a hard-linked inode (lib/atomic-write.ts).
// ---------------------------------------------------------------------------

/** One ignore-file line reduced to what decides whether it names a path. */
export interface IgnorePattern {
  negated: boolean;
  // The path with one leading `/` or `**/` and one trailing `/`, `/*` or
  // `/**` removed.
  core: string;
  // Matches at any depth: no slash before its end, or a leading `**/`.
  floating: boolean;
  // The trailing part removed from `core`: '' (a file or a directory), '/'
  // (directories only), '/*' or '/**' (everything inside a directory).
  suffix: '' | '/' | '/*' | '/**';
}

/**
 * One line → its pattern, or null for a blank line or a comment. Git (and
 * Prettier, which follows it) strips unescaped TRAILING spaces but keeps
 * leading ones, so only the end is trimmed; one trailing CR is a CRLF file's
 * line ending. Then one leading `/` (anchored) or `**\/` (any depth), and one
 * trailing `/`, `/*` or `/**`.
 */
export function parseIgnorePattern(raw: string): IgnorePattern | null {
  const line = (raw.endsWith('\r') ? raw.slice(0, -1) : raw).replace(
    /[ \t]+$/,
    '',
  );
  if (line === '' || line.startsWith('#')) return null;
  let p = line;
  const negated = p.startsWith('!');
  if (negated) p = p.slice(1);
  let anyDepth = false;
  let anchored = false;
  if (p.startsWith('**/')) {
    anyDepth = true;
    p = p.slice(3);
  } else if (p.startsWith('/')) {
    anchored = true;
    p = p.slice(1);
  }
  // `/*` and `/**` put a slash before the end, which anchors the pattern; a
  // lone trailing `/` only limits it to directories.
  const suffix = (/(\/\*\*|\/\*|\/)$/.exec(p)?.[0] ??
    '') as IgnorePattern['suffix'];
  p = p.slice(0, p.length - suffix.length);
  const floating =
    anyDepth ||
    (!anchored && suffix !== '/*' && suffix !== '/**' && !p.includes('/'));
  return { negated, core: p, floating, suffix };
}

// A UTF-8 byte-order mark, as latin1 decodes it. Git strips one at the start
// of an ignore file, so the first line is read without it too — detection
// only: the file's bytes are never changed.
const UTF8_BOM = 'ï»¿';

/** The file's lines, BOM-aware. latin1 is a 1:1 byte decode (never re-encoded). */
export function ignoreFileLines(bytes: Buffer): string[] {
  const text = bytes.toString('latin1');
  return (text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text).split(
    '\n',
  );
}

/** Every pattern in `bytes`, in file order. */
export function ignorePatterns(bytes: Buffer): IgnorePattern[] {
  return ignoreFileLines(bytes)
    .map(parseIgnorePattern)
    .filter((p): p is IgnorePattern => p !== null);
}

/**
 * The bytes to APPEND to `old` (null = no file yet) so that it holds
 * `entries`, under `comment`. Empty when `entries` is empty.
 *
 * Line endings follow the file: CRLF when its first line ending is `\r\n`,
 * else LF (and LF for a new file). A non-empty file that does not end in a line
 * ending gets one first, so the block starts on a line of its own. The comment
 * is written only when the file does not already hold it.
 */
export function ignoreAddition(
  old: Buffer | null,
  entries: readonly string[],
  comment: string,
): Buffer {
  if (entries.length === 0) return Buffer.alloc(0);
  const bytes = old ?? Buffer.alloc(0);
  const text = bytes.toString('latin1');
  const firstLf = text.indexOf('\n');
  const eol = firstLf > 0 && text[firstLf - 1] === '\r' ? '\r\n' : '\n';
  const hasComment = ignoreFileLines(bytes).some(
    (l) => l.replace(/[ \t\r]+$/, '') === comment,
  );
  const parts: string[] = [];
  if (text.length > 0 && !text.endsWith('\n')) parts.push(eol);
  if (!hasComment) parts.push(comment + eol);
  for (const entry of entries) parts.push(entry + eol);
  return Buffer.from(parts.join(''), 'latin1');
}

/** Why an ignore file was left alone. Fixed values, never file content. */
export type IgnoreRefusal = 'symlink' | 'not-a-file' | 'unreadable';

/** The root ignore file `name`, read for planning. Never throws. */
export type IgnoreFileRead =
  | { kind: 'absent' }
  | { kind: 'refused'; reason: IgnoreRefusal }
  | { kind: 'ok'; bytes: Buffer };

/**
 * Read the root ignore file `name`: absent, refused (a symlink — never written
 * through, nor replaced, it is the user's; not a regular file; unreadable or
 * oversize), or its bytes.
 */
export function readIgnoreFile(
  projectRoot: string,
  name: string,
): IgnoreFileRead {
  const target = safeJoin(projectRoot, name);
  let isLink: boolean;
  try {
    isLink = lstatSync(target).isSymbolicLink();
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'absent' }
      : { kind: 'refused', reason: 'unreadable' };
  }
  if (isLink) return { kind: 'refused', reason: 'symlink' };
  const read = readBoundedFile(target);
  if (read.kind === 'absent') return { kind: 'refused', reason: 'unreadable' }; // gone since lstat
  if (read.kind === 'unusable')
    return {
      kind: 'refused',
      reason:
        read.code === 'not-a-file' || read.code === 'EISDIR'
          ? 'not-a-file'
          : 'unreadable',
    };
  return { kind: 'ok', bytes: read.bytes };
}

/**
 * Write `old` + `append` to the root file `name`, atomically. Returns null on
 * success, or the failure's errno code (a fixed-shape string, else
 * `EUNKNOWN`) — never throws.
 */
export async function writeIgnoreFile(
  projectRoot: string,
  name: string,
  old: Buffer | null,
  append: Buffer,
): Promise<string | null> {
  try {
    await writeFileAtomic(
      safeJoin(projectRoot, name),
      Buffer.concat([old ?? Buffer.alloc(0), append]),
    );
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)
      ? code
      : 'EUNKNOWN';
  }
}
