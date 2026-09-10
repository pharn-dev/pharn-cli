import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
 * Three buckets, not two — the middle one is load-bearing:
 *
 *   ACCEPT  typeflag '0' / NUL (regular file) and '5' (directory).
 *   SKIP    typeflag 'g' (pax global header) — but only once its records have
 *           been READ and found harmless. Every GitHub codeload tarball opens
 *           with a `pax_global_header` whose single-segment name has no leading
 *           component to strip, so an extractor that runs the path rules over it
 *           rejects every real archive on its FIRST block; it is the one entry
 *           that must be skipped rather than judged as a path.
 *   REJECT  typeflag 'x' (pax extended header), a 'g' that sets a path/size
 *           default, and everything else: '1'/'2' (hard/symlink), '3'/'4'
 *           (devices), '6' (fifo), '7', GNU 'L'/'K' (long name / long link
 *           name), and any unknown byte.
 *
 * WHY PAX IS REFUSED RATHER THAN HONOURED. A pax header's records OVERRIDE the
 * ustar header they precede, and two of them decide what this module does:
 * `path=` replaces prefix+name, and `size=` replaces how many bytes the entry
 * occupies. A writer emits `path=` exactly when the real path does not fit
 * ustar — and writes the path TRUNCATED to the 100-byte `name` field in the
 * header it cannot represent. That truncated path is relative, has a leading
 * component and contains no '..', so it passes every rule below: discarding the
 * record lands the file at a wrong-but-contained path, SILENTLY. A discarded
 * `size=` is worse — it mis-frames every following header, so the reader starts
 * parsing attacker-controlled file CONTENT as tar headers.
 *
 * The refusal is asymmetric, and the asymmetry is measured rather than assumed.
 * The live archive (1,968 entries) contains ZERO 'x' headers and exactly one
 * 'g', carrying `comment=<sha>`. So for 'x', PRESENCE is the signal: the throw
 * reads the typeflag byte alone and never consults the payload, which is why no
 * malformed payload can suppress it. 'g' is mandatory in every real archive, so
 * only its CONTENTS can be the signal: its records are parsed, and a `path`,
 * `linkpath` or `size` default — or a payload that does not parse cleanly —
 * throws, while `comment`/`mtime`/vendor records are skipped as before.
 *
 * Honouring pax is deliberately NOT the fix. pharn fetches one known archive
 * shape; implementing `path=` would mean running the path rules over a second
 * untrusted path source, which is new attack surface bought for a case that
 * does not occur.
 *
 * Untrusted input (P2): the archive is remote bytes. Every accepted path is
 * reconstructed from `prefix` + `name`, checked for absoluteness and `..`
 * segments, stripped of exactly one leading component, and resolved through
 * `safeJoin` against the destination — the same lexical containment gate the
 * install writers use. Contents are written verbatim, never executed.
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
const OFF_PREFIX = 345;
const LEN_PREFIX = 155;

export interface TarLimits {
  /** Maximum number of ACCEPTed entries. */
  maxEntries: number;
  /** Maximum total bytes written across all ACCEPTed files. */
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
 * A ustar numeric field: octal digits, space- or NUL-terminated. GNU's base-256
 * extension (high bit set on the first byte) is REJECTED rather than
 * misparsed — this archive's largest file is far under the 8 GB octal ceiling,
 * so a base-256 size here is malformed input, not a large file.
 */
function readOctal(block: Buffer, offset: number, length: number): number {
  const raw = block.subarray(offset, offset + length);
  if (raw.length > 0 && (raw[0]! & 0x80) !== 0) {
    throw new TarExtractError(
      'tar header uses the GNU base-256 numeric encoding, which pharn does not accept.',
    );
  }
  const text = readString(block, offset, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) {
    throw new TarExtractError(
      `tar header has a non-octal numeric field: ${text}`,
    );
  }
  return parseInt(text, 8);
}

/**
 * The pax record keywords that override what this module reads out of the ustar
 * header that follows: where the entry is written, and how many bytes it spans.
 * Membership here is an exact string compare against the raw keyword, so no
 * encoding trick can spoof it.
 */
const PAX_OVERRIDE_KEYWORDS = new Set(['path', 'linkpath', 'size']);

/** Keyword shape allowed into an error message, so no remote byte reaches a terminal raw. */
const PAX_KEYWORD_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** At most this many keywords are named in a message; the rest are elided. */
const PAX_KEYWORDS_IN_MESSAGE = 8;

/**
 * Read a pax header's payload as its list of record KEYWORDS, or `null` when it
 * does not parse cleanly under the POSIX grammar `<len> SP <keyword>=<value> LF`
 * (where `<len>` counts the whole record, its own digits included).
 *
 * `null` is a refusal, not a shrug: callers throw on it. Returning "the
 * keywords I managed to find" would let a record whose length prefix disagrees
 * with its own bytes hide a `path=` between two mis-split records — so a payload
 * this reader cannot account for END TO END is treated as unexpected input,
 * which is the same posture the rest of the module takes.
 *
 * Values are never returned. Only the keyword is ever used, and only for a
 * membership test or a filtered message.
 */
function readPaxKeywords(payload: Buffer): string[] | null {
  const keywords: string[] = [];
  let at = 0;
  while (at < payload.length) {
    const space = payload.indexOf(0x20, at); // ' '
    if (space === -1) return null;
    const digits = payload.subarray(at, space).toString('latin1');
    if (!/^[0-9]{1,10}$/.test(digits)) return null;
    const end = at + Number(digits);
    // The record must end inside the payload, past its own length field (which
    // also guarantees forward progress), and on its own newline.
    if (end > payload.length || end <= space || payload[end - 1] !== 0x0a) {
      return null;
    }
    // ...with a non-empty keyword and a '=' before that newline.
    const eq = payload.indexOf(0x3d, space + 1); // '='
    if (eq === -1 || eq < space + 2 || eq > end - 2) return null;
    keywords.push(payload.subarray(space + 1, eq).toString('latin1'));
    at = end;
  }
  return keywords;
}

/**
 * Render keywords for an error message: shape-filtered, deduped and capped, so
 * a hostile payload cannot push control characters or unbounded text into a
 * terminal. Diagnosis only — no branch reads this.
 */
function describeKeywords(keywords: string[] | null): string {
  if (keywords === null) return 'its records could not be read';
  if (keywords.length === 0) return 'it carries no records';
  const shown = [...new Set(keywords)]
    .map((keyword) =>
      PAX_KEYWORD_RE.test(keyword) ? keyword : '<unprintable>',
    )
    .slice(0, PAX_KEYWORDS_IN_MESSAGE);
  const more = new Set(keywords).size - shown.length;
  return `records ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`;
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
  let totalBytes = 0;
  let expectedRoot: string | null = null;

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (isZeroBlock(header)) break;
    if (!checksumOk(header)) {
      throw new TarExtractError(
        'tar header failed its checksum — the archive is corrupt or truncated.',
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

    // REJECT — a per-file pax extended header. The decision is the typeflag
    // ALONE; the payload is read only afterwards, to name what was seen. (The
    // ustar size field above is still read first, so an 'x' whose size field is
    // itself malformed surfaces as that numeric refusal rather than this one —
    // both are a TarExtractError and neither writes.)
    if (typeflag === 'x') {
      throw new TarExtractError(
        "tar archive contains a pax extended header (typeflag 'x'), which pharn does not " +
          `support — its records override the next entry's path and size: ${describeKeywords(
            readPaxKeywords(tar.subarray(dataStart, dataEnd)),
          )}.`,
      );
    }

    // SKIP — a pax GLOBAL header, but only after reading it. No path rules are
    // applied to the header itself (see the module comment); its records are
    // what is judged, because a global record is a default for every entry that
    // follows it.
    if (typeflag === 'g') {
      const keywords = readPaxKeywords(tar.subarray(dataStart, dataEnd));
      if (keywords === null) {
        throw new TarExtractError(
          'tar archive has a pax global header whose records could not be read.',
        );
      }
      const overrides = keywords.filter((keyword) =>
        PAX_OVERRIDE_KEYWORDS.has(keyword),
      );
      if (overrides.length > 0) {
        throw new TarExtractError(
          'tar archive has a pax global header setting a default that overrides every ' +
            `following entry, which pharn does not support: ${describeKeywords(overrides)}.`,
        );
      }
      offset = next;
      continue;
    }

    const isFile = typeflag === '0' || typeflag === '\0';
    const isDirectory = typeflag === '5';
    if (!isFile && !isDirectory) {
      throw new TarExtractError(
        `tar entry has an unsupported type '${typeflag}': ${readString(header, OFF_NAME, LEN_NAME)}`,
      );
    }

    const name = readString(header, OFF_NAME, LEN_NAME);
    const prefix = readString(header, OFF_PREFIX, LEN_PREFIX);
    const fullPath = prefix === '' ? name : `${prefix}/${name}`;
    const { rel, root } = resolveEntryPath(fullPath, isDirectory, expectedRoot);
    expectedRoot = root;

    if (rel !== null) {
      entries += 1;
      if (entries > limits.maxEntries) {
        throw new TarExtractError(
          `tar archive has more than ${limits.maxEntries} entries.`,
        );
      }
      totalBytes += size;
      if (totalBytes > limits.maxTotalBytes) {
        throw new TarExtractError(
          `tar archive expands past ${limits.maxTotalBytes} bytes.`,
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
}
