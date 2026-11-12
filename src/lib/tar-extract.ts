import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { escapeUnsafe, hasUnsafeChars } from './terminal-safe.js';
import { safeJoin } from './validate.js';

/**
 * The tar half of pharn's fetch boundary — a minimal, strict ustar reader for
 * the ONE archive shape pharn consumes: GitHub's `codeload.../tar.gz/<sha>`.
 *
 * Why in-repo rather than a tar dependency (P3, and the four-dependency
 * posture): the guarantees below ARE the fetch boundary. Handing them to a
 * dependency re-imports the exact problem the degit pin existed to manage —
 * properties measured once, at one version, that a transitive bump can move
 * without a pharn test noticing. Everything here is unit-testable against
 * hand-built adversarial archives, so the rejections are pharn's own floor.
 *
 * STRICTER THAN WHAT IT REPLACES. degit passed neither `strict` nor `onwarn`,
 * so a malformed entry was silently dropped and extraction still resolved. Here
 * every unexpected entry is a THROW: the archive pharn fetches contains only
 * regular files and directories, so anything else is a signal, not noise.
 *
 * WHAT THE TREE CAN HOLD (the invariant `fetchRepo` states, lib/repo.ts): only
 * regular files and directories, under `destDir`. Nothing else is ever created:
 * the only writes are `mkdirSync` and `writeFileSync`, each through `safeJoin`.
 * Clone-side readers rely on this instead of re-checking for links.
 *
 * Three buckets:
 *
 *   ACCEPT  typeflag '0' / NUL (regular file) and '5' (directory).
 *   SKIP    typeflag 'g' (pax global header), its payload UNREAD. Every GitHub
 *           codeload tarball opens with a `pax_global_header` whose
 *           single-segment name has no leading component to strip, so it is the
 *           one entry that must be skipped rather than judged as a path. It
 *           still counts toward `maxEntries`.
 *   REJECT  everything else: 'x' (pax extended header), '1'/'2' (hard/symlink),
 *           '3'/'4' (devices), '6' (fifo), '7', GNU 'L'/'K' (long name / long
 *           link name), and any unknown byte.
 *
 * WHY PAX IS NEVER HONOURED. pharn reads ONLY the ustar fields: `name`,
 * `prefix`, `size`, `typeflag`. A pax record would override two of them —
 * `path=` replaces prefix+name, `size=` how many bytes the entry spans — so
 * honouring pax would mean a second untrusted path source. A per-file 'x' header
 * exists to carry exactly those overrides, and a writer emits one when the real
 * path does not fit ustar (writing it TRUNCATED into `name`, where it would pass
 * every rule below), so 'x' is refused on its typeflag alone, payload unread.
 * A global 'g' header cannot be refused (every real archive has one), and
 * ignoring it is safe: its defaults are never consulted, so the entries that
 * follow land at their own ustar paths under every rule below, and the walk is
 * framed by the ustar `size` alone — a stream that does not agree with it fails
 * the next header's checksum or magic. The cost, named: an archive whose `g`
 * meant "put everything at X" is extracted at its ustar paths, contained.
 *
 * Untrusted input (P2): the archive is remote bytes. Every accepted path is
 * reconstructed from `prefix` + `name`, checked for absoluteness, `..`
 * segments, `\` and `:`, stripped of exactly one leading component, and
 * resolved through `safeJoin` against the destination — the same lexical
 * containment gate the install writers use. Contents are written verbatim,
 * never executed.
 */
/** A ustar header block is exactly 512 bytes; payloads are padded to that. */
const BLOCK = 512;

// Header field offsets (POSIX ustar).
const OFF_NAME = 0;
const LEN_NAME = 100;
const OFF_SIZE = 124;
const LEN_SIZE = 12;
const OFF_CHKSUM = 148;
const LEN_CHKSUM = 8;
const OFF_TYPEFLAG = 156;
const OFF_MAGIC = 257;
const OFF_PREFIX = 345;
const LEN_PREFIX = 155;

export interface TarLimits {
  /** Maximum number of ACCEPTed entries. */
  maxEntries: number;
  /**
   * The largest DECOMPRESSED tar `extractTarGz` accepts (gunzip's
   * `maxOutputLength`). The tar holds every byte an entry writes, so this is
   * also the bound on bytes written; `extractTar` itself does not re-count.
   */
  maxTotalBytes: number;
}

/** Every refusal this module makes, so callers can tell it from an fs error. */
export class TarExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TarExtractError';
  }
}

/** A NUL-terminated (or field-filling) ASCII string out of a header field. */
function readString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('latin1');
}

/**
 * Header bytes for a message, and only for a message: printable ASCII is kept,
 * every other byte becomes `\xNN`, and the result is capped. Total over bytes,
 * so no header byte (a newline, an ESC, a C1 control) reaches a terminal raw.
 */
function describeBytes(bytes: Buffer, max = 200): string {
  let out = '';
  for (const byte of bytes.subarray(0, max)) {
    out +=
      byte >= 0x20 && byte <= 0x7e && byte !== 0x5c // printable, not `\`
        ? String.fromCharCode(byte)
        : `\\x${byte.toString(16).padStart(2, '0')}`;
  }
  return bytes.length > max ? `${out}…` : out;
}

/**
 * Entry-path fields are decoded ONCE, and the check and the write both use the
 * result. `fatal`: bytes that are not valid UTF-8 are a refusal, never a
 * replacement character. `ignoreBOM`: a leading U+FEFF stays IN the string —
 * the default strips it silently — so the format-character check below sees,
 * and refuses, exactly the name that would otherwise be written.
 */
const PATH_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** A NUL-terminated (or field-filling) entry-path field, as strict UTF-8. */
function readPathField(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  const bytes = raw.subarray(0, end === -1 ? raw.length : end);
  try {
    return PATH_DECODER.decode(bytes);
  } catch {
    throw new TarExtractError(
      `tar entry path is not valid UTF-8: "${describeBytes(bytes)}"`,
    );
  }
}

/**
 * A ustar numeric field: octal digits, space- or NUL-terminated. GNU's base-256
 * extension (high bit set on the first byte) is never misread: no such byte is
 * an octal digit, so it fails the octal test below. Only ASCII space is trimmed
 * — `String#trim` would also strip U+00A0 (latin1 0xA0, a high-bit byte) and
 * read the digits behind it.
 */
function readOctal(block: Buffer, offset: number, length: number): number {
  const text = readString(block, offset, length).replace(/^ +| +$/g, '');
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) {
    throw new TarExtractError(
      `tar header has a non-octal numeric field: "${describeBytes(
        Buffer.from(text, 'latin1'),
        32,
      )}"`,
    );
  }
  return parseInt(text, 8);
}

/**
 * Refuse an entry path holding a control character or a Unicode format
 * character (U+202E, U+200B, U+FEFF, …). Such a name would be printed later —
 * by an error here, or by `status`/`update` listing installed files — and a
 * terminal interprets those characters. `fullPath` is the strict UTF-8 decoding
 * (`readPathField`) that the path rules and the write also use, so what is
 * judged here is exactly the name passed to the filesystem: an ordinary
 * non-ASCII name (`é`, `—`) passes and is written as those same bytes, while a
 * C1 byte never survives the decode. pharn-oss ships no non-ASCII name today.
 */
function assertDisplayablePath(fullPath: string): void {
  if (hasUnsafeChars(fullPath)) {
    throw new TarExtractError(
      // Escaped HERE, not only at the print site: under PHARN_DEBUG the raw
      // error object is printed, past logError's strip.
      `tar entry path contains a control or format character: "${escapeUnsafe(
        fullPath.length > 200 ? `${fullPath.slice(0, 200)}…` : fullPath,
      )}"`,
    );
  }
}

/** A typeflag for a message: the character if printable, else its code. */
function describeTypeflag(typeflag: string): string {
  if (typeflag === 'x') {
    return "'x' (a pax extended header, whose records would override the next entry's path and size)";
  }
  return hasUnsafeChars(typeflag)
    ? `0x${typeflag.charCodeAt(0).toString(16).padStart(2, '0')}`
    : `'${typeflag}'`;
}

/** Refuse any non-zero byte from `from` to the end (after the end marker). */
function assertZeroTail(tar: Buffer, from: number): void {
  for (let i = from; i < tar.length; i += 1) {
    if (tar[i] !== 0) {
      throw new TarExtractError(
        'tar archive has data after its end-of-archive marker.',
      );
    }
  }
}

/** True when the block is 512 NUL bytes — the end-of-archive marker. */
function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}

/**
 * Verify the header checksum: the sum of every header byte with the checksum
 * field itself read as eight spaces. Historic writers disagree on whether the
 * bytes are signed, so both are accepted — the point is detecting a corrupt or
 * truncated stream, not adjudicating a format dispute.
 */
function checksumOk(block: Buffer): boolean {
  const stored = readOctal(block, OFF_CHKSUM, LEN_CHKSUM);
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < BLOCK; i += 1) {
    const inChecksumField = i >= OFF_CHKSUM && i < OFF_CHKSUM + LEN_CHKSUM;
    const byte = inChecksumField ? 0x20 : block[i]!;
    unsigned += byte;
    signed += byte > 127 ? byte - 256 : byte;
  }
  return stored === unsigned || stored === signed;
}

/**
 * Apply the path rules to an ACCEPTed entry and return its destination-relative
 * path, or `null` when the entry is the archive's own root directory (which has
 * nothing left after the strip and is not an error).
 *
 * Order matters: the full path is reconstructed from `prefix` + `name` BEFORE
 * any rule runs. ustar splits any path over 100 characters across `prefix`
 * (offset 345) and `name` (offset 0); reading `name` alone yields a bare
 * leaf for those entries, which the strip-1 rule would then reject for having
 * no leading component — silently losing a third of the tree rather than
 * misplacing it.
 */
function resolveEntryPath(
  fullPath: string,
  isDirectory: boolean,
  expectedRoot: string | null,
): { rel: string | null; root: string } {
  if (fullPath === '') {
    throw new TarExtractError('tar entry has an empty path.');
  }
  if (fullPath.startsWith('/')) {
    throw new TarExtractError(`tar entry has an absolute path: ${fullPath}`);
  }
  // POSIX writes `a\..\..\evil` as ONE literal name; win32 reads the same
  // bytes as a path (and `C:` as a drive). pharn-oss ships neither character.
  if (/[\\:]/.test(fullPath)) {
    throw new TarExtractError(
      `tar entry path contains a backslash or colon, which pharn does not accept: ${fullPath}`,
    );
  }
  const segments = fullPath.replace(/\/+$/, '').split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw new TarExtractError(
        `tar entry escapes the archive root: ${fullPath}`,
      );
    }
  }
  const root = segments[0]!;
  if (root === '' || root === '.') {
    throw new TarExtractError(
      `tar entry has no leading component: ${fullPath}`,
    );
  }
  // One root, and the same one throughout. A GitHub archive is a single
  // `pharn-oss-<sha>/` tree; a second root would mean the strip-1 rule is
  // flattening two unrelated trees into one destination.
  if (expectedRoot !== null && root !== expectedRoot) {
    throw new TarExtractError(
      `tar archive has more than one root component: ${expectedRoot} and ${root}`,
    );
  }
  const rest = segments.slice(1);
  // Below the root, every segment must name something: `a//b` and `a/./b` are
  // refused here rather than left to safeJoin's lexical backstop.
  if (rest.some((segment) => segment === '' || segment === '.')) {
    throw new TarExtractError(
      `tar entry has an empty or "." path segment: ${fullPath}`,
    );
  }
  if (rest.length === 0) {
    // The root directory entry itself: nothing to write, not a failure.
    if (isDirectory) return { rel: null, root };
    throw new TarExtractError(
      `tar entry has no path below the archive root: ${fullPath}`,
    );
  }
  return { rel: rest.join('/'), root };
}

/**
 * Extract a gzipped tar into `destDir`, stripping the single leading path
 * component. Throws `TarExtractError` on any refusal — a caller that sees one
 * must treat the destination as unusable and remove it, since extraction is not
 * transactional.
 */
export function extractTarGz(
  archive: Buffer,
  destDir: string,
  limits: TarLimits,
): void {
  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: limits.maxTotalBytes });
  } catch (err) {
    throw new TarExtractError(
      `could not decompress the fetched archive: ${(err as Error).message}`,
    );
  }
  extractTar(tar, destDir, limits);
}

/** The uncompressed half, split out so tests can build tar bytes directly. */
export function extractTar(
  tar: Buffer,
  destDir: string,
  limits: TarLimits,
): void {
  let offset = 0;
  let entries = 0;
  let expectedRoot: string | null = null;

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    // The end-of-archive marker. Everything after it must be zero padding: a
    // zero block followed by more entries used to end the walk there and drop
    // the rest of the tree in silence, and trailing garbage was accepted.
    if (isZeroBlock(header)) {
      assertZeroTail(tar, offset + BLOCK);
      return;
    }
    if (!checksumOk(header)) {
      throw new TarExtractError(
        'tar header failed its checksum — the archive is corrupt or truncated.',
      );
    }
    // Every header git archive writes is ustar (`ustar\0`); old GNU writes
    // `ustar ` — the 5-byte prefix admits both and nothing else.
    if (header.toString('latin1', OFF_MAGIC, OFF_MAGIC + 5) !== 'ustar') {
      throw new TarExtractError(
        'tar header is not a ustar header (missing "ustar" magic).',
      );
    }

    const size = readOctal(header, OFF_SIZE, LEN_SIZE);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) {
      throw new TarExtractError(
        'tar entry runs past the end of the archive — truncated.',
      );
    }
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    const typeflag = String.fromCharCode(header[OFF_TYPEFLAG]!);

    // SKIP — a pax GLOBAL header, payload unread (see the module comment). It
    // counts toward the entry cap like any other header.
    if (typeflag === 'g') {
      entries += 1;
      if (entries > limits.maxEntries) {
        throw new TarExtractError(
          `tar archive has more than ${limits.maxEntries} entries.`,
        );
      }
      offset = next;
      continue;
    }

    // The FULL path (prefix + name) is judged before any other entry rule, so
    // no later message can interpolate a control or format character from it —
    // and it is the same decoded string the path rules and the write use.
    const name = readPathField(header, OFF_NAME, LEN_NAME);
    const prefix = readPathField(header, OFF_PREFIX, LEN_PREFIX);
    const fullPath = prefix === '' ? name : `${prefix}/${name}`;
    assertDisplayablePath(fullPath);

    const isFile = typeflag === '0' || typeflag === '\0';
    const isDirectory = typeflag === '5';
    if (!isFile && !isDirectory) {
      throw new TarExtractError(
        `tar entry has an unsupported type ${describeTypeflag(typeflag)}: ${fullPath}`,
      );
    }

    const { rel, root } = resolveEntryPath(fullPath, isDirectory, expectedRoot);
    expectedRoot = root;

    if (rel !== null) {
      entries += 1;
      if (entries > limits.maxEntries) {
        throw new TarExtractError(
          `tar archive has more than ${limits.maxEntries} entries.`,
        );
      }
      // safeJoin is the lexical containment gate (lib/validate.ts) every path
      // derived from untrusted input goes through, here as the backstop behind
      // the segment rules above rather than instead of them.
      const target = safeJoin(destDir, rel);
      if (isDirectory) {
        mkdirSync(target, { recursive: true });
      } else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, tar.subarray(dataStart, dataEnd));
      }
    }

    offset = next;
  }
  // The walk ran out of bytes without meeting a zero block: the archive was cut
  // short (every real tar ends with at least one).
  throw new TarExtractError(
    'tar archive has no end-of-archive marker — truncated.',
  );
}
