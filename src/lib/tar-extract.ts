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
 *   SKIP    typeflag 'g' (pax global header) and 'x' (pax extended header):
 *           advance past the header and its padded payload, applying NO path
 *           rules. Every GitHub codeload tarball opens with a
 *           `pax_global_header` whose single-segment name has no leading
 *           component to strip — an extractor that runs the path rules over it
 *           rejects every real archive on its FIRST block.
 *   REJECT  everything else: '1'/'2' (hard/symlink), '3'/'4' (devices), '6'
 *           (fifo), '7', and any unknown byte.
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

    // SKIP — pax metadata. No path rules: see the module comment.
    if (typeflag === 'g' || typeflag === 'x') {
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
