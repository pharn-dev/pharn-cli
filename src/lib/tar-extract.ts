import { createGunzip } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { escapeUnsafe, hasUnsafeChars } from './terminal-safe.js';
import { safeJoin } from './validate.js';

/**
 * The tar half of pharn's fetch boundary — a minimal, strict ustar reader for
 * the ONE archive shape pharn consumes: GitHub's `codeload.../tar.gz/<sha>`.
 * In-repo rather than a dependency because these guarantees ARE the fetch
 * boundary, unit-tested against hand-built adversarial archives.
 *
 * SELECT, THEN JUDGE. The caller names the root-relative paths to write
 * (`select`: the paths pharn-install.json lists, plus the few files the CLI
 * reads itself, lib/repo.ts). Every other entry is skipped and never written,
 * whatever its type or name: nothing unselected touches disk, so skipping is
 * strictly safer than judging. A symlink, hard link, device, pax header, long
 * or `:` name anywhere else in the repo no longer refuses the install.
 *
 *   EVERY header is framing-checked, because the walk cannot find the next one
 *     without it: checksum, `ustar` magic, an octal `size`, the header and
 *     scanned-byte caps, and the end-of-archive marker with a zero tail.
 *   A SELECTED header gets the full rules: strict UTF-8, no control or format
 *     character, a regular file (typeflag '0' / NUL) only, its path rebuilt from
 *     `prefix` + `name`, refused when absolute or holding `..`, `\`, `:` or an
 *     empty or `.` segment, one root shared by every selected entry, one leading
 *     component stripped, `safeJoin`-contained, written once, within the
 *     written-byte cap. Contents are written verbatim, never executed.
 *
 * WHAT THE TREE CAN HOLD (the invariant `fetchRepo` states, lib/repo.ts): only
 * regular files and the directories above them, under `destDir`, at selected
 * paths — the only writes are `mkdirSync` and `writeFileSync`, each through
 * `safeJoin`. Clone-side readers rely on this instead of re-checking for links.
 *
 * PAX IS NEVER HONOURED: only the ustar `name`, `prefix`, `size` and
 * `typeflag` are read, never a pax payload. A pax 'x' header (and GNU 'L'/'K')
 * rewrites the NEXT entry's path or size, so it is skipped together with the
 * entry it modifies, as unselected. When that entry's ustar name is a selected
 * path, it is refused: pharn will not install a listed file whose real path or
 * size it ignores. When the pax record renamed a listed file away from its
 * ustar name, that file is simply missing, and the manifest's sha256 check
 * (`verifyUpstreamManifest`) refuses the tree. A 'g' (global) header — every
 * codeload tarball opens with one — is skipped and modifies nothing: its
 * defaults are never consulted, and the walk is framed by the ustar `size`
 * alone (a disagreeing stream fails the next header's checksum or magic).
 *
 * The decompressed tar is streamed, never held whole, so a repo larger than the
 * written-byte cap still installs; the scanned-byte cap only bounds the work a
 * compression bomb can cause.
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

/** Headers that rewrite the NEXT entry's path, size or link name. */
const MODIFIERS = new Set(['x', 'L', 'K']);

export interface TarLimits {
  /** Headers walked, of any type, selected or not. */
  maxHeaders: number;
  /** Decompressed bytes walked: bounds a compression bomb's work, not the repo. */
  maxScannedBytes: number;
  /** Bytes written: the sum of the selected files' sizes. */
  maxWrittenBytes: number;
}

export interface ExtractOptions {
  /** Root-relative paths to write; every other entry is skipped unwritten. */
  select: ReadonlySet<string>;
  limits: TarLimits;
  /** The archive's root component, when an earlier pass already learned it. */
  root?: string | null;
}

export interface ExtractResult {
  /** The root-relative paths written. */
  written: ReadonlySet<string>;
  /** Their total size in bytes. */
  bytes: number;
  /** The root component every selected entry shared (`null`: none selected). */
  root: string | null;
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
 * result. `fatal`: invalid UTF-8 is a refusal, never a replacement character.
 * `ignoreBOM`: a leading U+FEFF stays in the string (the default strips it), so
 * the format-character check refuses exactly the name that would be written.
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
 * Is this header at a selected path? Its raw `prefix`/`name` bytes (latin1, so
 * byte for byte) with everything up to the first `/` — the archive root —
 * stripped are the key. A name with no `/` at all that IS a selected path is
 * selected too, so a rootless copy of a listed file is refused (it has no
 * component to strip) rather than skipped. Every selected path is ASCII, so an
 * exact membership test on these bytes is exact, and an unselected name is
 * never decoded, judged or printed.
 */
function isSelected(block: Buffer, select: ReadonlySet<string>): boolean {
  const name = readString(block, OFF_NAME, LEN_NAME);
  const prefix = readString(block, OFF_PREFIX, LEN_PREFIX);
  const raw = prefix === '' ? name : `${prefix}/${name}`;
  const slash = raw.indexOf('/');
  return select.has(slash === -1 ? raw : raw.slice(slash + 1));
}

/**
 * A ustar numeric field: octal digits, space- or NUL-terminated. GNU base-256
 * (high bit on the first byte) fails the octal test. Only ASCII space is
 * trimmed — `String#trim` would strip U+00A0 (latin1 0xA0) and read past it.
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
 * Refuse an entry path holding a control or Unicode format character (U+202E,
 * U+200B, U+FEFF, …): the name is printed later, and a terminal interprets
 * them. `fullPath` is the same strict UTF-8 decoding the path rules and the
 * write use, so an ordinary non-ASCII name passes and is written as-is.
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

/** True when the block is 512 NUL bytes — the end-of-archive marker. */
function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}

/**
 * Verify the header checksum: the sum of every header byte with the checksum
 * field read as eight spaces. Signed and unsigned sums are both accepted
 * (historic writers disagree); the point is detecting a corrupt stream.
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
 * Apply the path rules to a selected file entry and return its
 * destination-relative path and root component.
 *
 * The full path is reconstructed from `prefix` + `name` BEFORE any rule runs:
 * ustar splits a path over 100 characters across the two, and `name` alone
 * would be a bare leaf the strip-1 rule rejects.
 */
function resolveEntryPath(
  fullPath: string,
  expectedRoot: string | null,
): { rel: string; root: string } {
  if (fullPath.startsWith('/')) {
    throw new TarExtractError(`tar entry has an absolute path: ${fullPath}`);
  }
  // POSIX writes `a\..\..\evil` as ONE literal name; win32 reads the same
  // bytes as a path (and `C:` as a drive). pharn-oss lists neither character.
  if (/[\\:]/.test(fullPath)) {
    throw new TarExtractError(
      `tar entry path contains a backslash or colon, which pharn does not accept: ${fullPath}`,
    );
  }
  const segments = fullPath.split('/');
  if (segments.includes('..')) {
    throw new TarExtractError(
      `tar entry escapes the archive root: ${fullPath}`,
    );
  }
  const root = segments[0]!;
  if (root === '.') {
    throw new TarExtractError(
      `tar entry has no leading component: ${fullPath}`,
    );
  }
  if (segments.length === 1) {
    throw new TarExtractError(
      `tar entry has no path below the archive root: ${fullPath}`,
    );
  }
  // One root, the same throughout: a second root would mean strip-1 flattens
  // two unrelated trees into one destination.
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
  return { rel: rest.join('/'), root };
}

/** The selected file whose payload is being collected. */
interface Pending {
  target: string;
  chunks: Buffer[];
}

/**
 * The walk itself, incremental so the decompressed tar can be streamed: `push`
 * takes chunks of any size (a header or payload may straddle two), `finish`
 * refuses an archive that ended early. A selected file is written only once
 * its whole payload has arrived, so a truncated archive writes no partial file.
 */
class TarWalker {
  private readonly written = new Set<string>();
  private bytes = 0;
  private headers = 0;
  private scanned = 0;
  private root: string | null;
  // Header bytes received so far (a header can straddle two chunks).
  private carry: Buffer[] = [];
  private carryLength = 0;
  // Payload and padding bytes of the current entry still to come.
  private dataLeft = 0;
  private padLeft = 0;
  private pending: Pending | null = null;
  // The typeflag of the modifier ('x', 'L', 'K') the previous header was, so
  // this one's ustar path and size may not be the real ones; `null`: none.
  private modifier: string | null = null;
  private ended = false;

  constructor(
    private readonly destDir: string,
    private readonly options: ExtractOptions,
  ) {
    this.root = options.root ?? null;
  }

  push(chunk: Buffer): void {
    this.scanned += chunk.length;
    if (this.scanned > this.options.limits.maxScannedBytes) {
      throw new TarExtractError(
        `tar archive decompresses to more than ${this.options.limits.maxScannedBytes} bytes.`,
      );
    }
    let at = 0;
    while (at < chunk.length) {
      if (this.ended) {
        // After the end-of-archive marker everything must be zero padding, so
        // a zero block cannot end the walk early and drop the rest in silence.
        if (!isZeroBlock(chunk.subarray(at))) {
          throw new TarExtractError(
            'tar archive has data after its end-of-archive marker.',
          );
        }
        return;
      }
      if (this.dataLeft > 0) {
        const n = Math.min(this.dataLeft, chunk.length - at);
        this.pending?.chunks.push(chunk.subarray(at, at + n));
        this.dataLeft -= n;
        at += n;
        if (this.dataLeft === 0) this.writePending();
        continue;
      }
      if (this.padLeft > 0) {
        const n = Math.min(this.padLeft, chunk.length - at);
        this.padLeft -= n;
        at += n;
        continue;
      }
      const n = Math.min(BLOCK - this.carryLength, chunk.length - at);
      this.carry.push(chunk.subarray(at, at + n));
      this.carryLength += n;
      at += n;
      if (this.carryLength === BLOCK) {
        const block =
          this.carry.length === 1 ? this.carry[0]! : Buffer.concat(this.carry);
        this.carry = [];
        this.carryLength = 0;
        this.header(block);
      }
    }
  }

  finish(): ExtractResult {
    if (this.dataLeft > 0) {
      throw new TarExtractError(
        'tar entry runs past the end of the archive — truncated.',
      );
    }
    // The walk ran out of bytes without meeting a zero block: the archive was
    // cut short (every real tar ends with at least one).
    if (!this.ended) {
      throw new TarExtractError(
        'tar archive has no end-of-archive marker — truncated.',
      );
    }
    return { written: this.written, bytes: this.bytes, root: this.root };
  }

  private header(block: Buffer): void {
    if (isZeroBlock(block)) {
      this.ended = true;
      return;
    }
    if (!checksumOk(block)) {
      throw new TarExtractError(
        'tar header failed its checksum — the archive is corrupt or truncated.',
      );
    }
    // Every header git archive writes is ustar (`ustar\0`); old GNU writes
    // `ustar ` — the 5-byte prefix admits both and nothing else.
    if (block.toString('latin1', OFF_MAGIC, OFF_MAGIC + 5) !== 'ustar') {
      throw new TarExtractError(
        'tar header is not a ustar header (missing "ustar" magic).',
      );
    }
    const size = readOctal(block, OFF_SIZE, LEN_SIZE);
    this.headers += 1;
    if (this.headers > this.options.limits.maxHeaders) {
      throw new TarExtractError(
        `tar archive has more than ${this.options.limits.maxHeaders} headers.`,
      );
    }
    const typeflag = String.fromCharCode(block[OFF_TYPEFLAG]!);
    const modifier = this.modifier;
    // A 'g' modifies nothing, so it neither sets nor consumes the flag.
    if (MODIFIERS.has(typeflag)) this.modifier = typeflag;
    else if (typeflag !== 'g') this.modifier = null;

    if (isSelected(block, this.options.select)) {
      this.accept(block, typeflag, modifier, size);
    }
    this.dataLeft = size;
    this.padLeft = Math.ceil(size / BLOCK) * BLOCK - size;
    if (size === 0) this.writePending();
  }

  /** The full rules, for a header at a selected path; arms `pending`. */
  private accept(
    block: Buffer,
    typeflag: string,
    modifier: string | null,
    size: number,
  ): void {
    // The FULL path is judged before any other rule, so no later message
    // interpolates a control character from it.
    const name = readPathField(block, OFF_NAME, LEN_NAME);
    const prefix = readPathField(block, OFF_PREFIX, LEN_PREFIX);
    const fullPath = prefix === '' ? name : `${prefix}/${name}`;
    assertDisplayablePath(fullPath);
    if (typeflag !== '0' && typeflag !== '\0') {
      throw new TarExtractError(
        `tar entry has an unsupported type ${describeTypeflag(typeflag)} at a path pharn installs (only a regular file is accepted there): ${fullPath}`,
      );
    }
    if (modifier !== null) {
      throw new TarExtractError(
        `tar entry follows a header of unsupported type ${describeTypeflag(modifier)}, whose records pharn does not honour, at a path pharn installs: ${fullPath}`,
      );
    }
    const { rel, root } = resolveEntryPath(fullPath, this.root);
    this.root = root;
    if (this.written.has(rel)) {
      throw new TarExtractError(
        `tar archive holds this path twice: ${fullPath}`,
      );
    }
    this.written.add(rel);
    this.bytes += size;
    if (this.bytes > this.options.limits.maxWrittenBytes) {
      throw new TarExtractError(
        `the files pharn installs from this archive exceed ${this.options.limits.maxWrittenBytes} bytes.`,
      );
    }
    // safeJoin is the lexical containment backstop behind the segment rules.
    this.pending = { target: safeJoin(this.destDir, rel), chunks: [] };
  }

  private writePending(): void {
    if (this.pending === null) return;
    const { target, chunks } = this.pending;
    this.pending = null;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.concat(chunks));
  }
}

/**
 * Extract the selected files of an uncompressed tar into `destDir`, stripping
 * the single leading path component. `tar` may come in chunks of any size.
 * Throws `TarExtractError` on any refusal — a caller that sees one must treat
 * the destination as unusable and remove it, since extraction is not
 * transactional.
 */
export function extractTar(
  tar: Buffer | readonly Buffer[],
  destDir: string,
  options: ExtractOptions,
): ExtractResult {
  const walker = new TarWalker(destDir, options);
  for (const chunk of Buffer.isBuffer(tar) ? [tar] : tar) walker.push(chunk);
  return walker.finish();
}

/**
 * `extractTar` over a gzipped archive, decompressed as a stream so the whole
 * tar is never held in memory. Takes the archive's bytes, never a URL, so a
 * local file goes through the same walk as a download.
 */
export async function extractTarGz(
  archive: Buffer,
  destDir: string,
  options: ExtractOptions,
): Promise<ExtractResult> {
  const walker = new TarWalker(destDir, options);
  const gunzip = createGunzip();
  gunzip.end(archive);
  // A refusal from the walk is rethrown as itself; only a gunzip failure is
  // reported as a decompression error.
  let refusal: unknown = null;
  try {
    for await (const chunk of gunzip) {
      try {
        walker.push(chunk as Buffer);
      } catch (err) {
        refusal = err;
        break;
      }
    }
  } catch (err) {
    throw new TarExtractError(
      `could not decompress the fetched archive: ${(err as Error).message}`,
    );
  }
  if (refusal !== null) throw refusal;
  return walker.finish();
}
