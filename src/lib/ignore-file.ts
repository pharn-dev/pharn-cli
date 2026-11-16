import { lstatSync } from 'node:fs';
import { readBoundedFile } from './bounded-read.js';
import { writeFileAtomic } from './atomic-write.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// Reading, parsing and appending to a root gitignore-syntax file (`.gitignore`,
// `.prettierignore`). WHICH entries a file must hold, and coverage, stay with
// each caller. APPEND-ONLY: the old bytes are always the prefix, never
// re-encoded or reordered.
//
// Trust: project content, read bounded and only compared against fixed or
// validated strings; its text never reaches a terminal or drives a path. The
// fixed root file is replaced atomically (lib/atomic-write.ts).
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
 * One line → its pattern, or null for a blank line or a comment. Only the end
 * is trimmed (git keeps leading spaces; a trailing CR is a CRLF line ending).
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

// A UTF-8 BOM as latin1 decodes it: git strips one, so detection does too
// (the bytes are never changed).
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
 * `entries`, under `comment` (written once per file). Line endings follow the
 * file's first one; a missing final newline is added first.
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
 * Read the root ignore file `name`: absent, refused (a symlink — the user's,
 * never written through or replaced; not a regular file; unreadable or
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
