import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// The content-hash primitive — one implementation, so status's drift check,
// the record store, the update decision, add/init's drift scan and remove's
// backup set can never disagree about what "the same content" means.
//
// `contentHash` is THE comparison hash. It folds CRLF → LF in text files, so a
// project re-checked-out with `core.autocrlf=true` does not read every file as
// edited. The fold is pharn-oss's own (pharn/floor/check-spec.mjs `bodyHash`):
// only a CR immediately followed by an LF is dropped. Cost: a change that ONLY
// swaps line endings in a text file is not a change to pharn.
//
// `sha256File` is the RAW byte hash, for true byte pins only
// (tests/hash.test.ts pins that no other src/ file calls it).
// ---------------------------------------------------------------------------

/**
 * How many leading bytes are sniffed for a NUL — git's own sniff size. git
 * does not line-convert content containing a NUL, so a file this rule calls
 * binary is one `core.autocrlf` left byte-exact (advisory: it describes git).
 * The rule can only err toward "text".
 */
export const BINARY_SNIFF_BYTES = 8000;

const CR = 0x0d;
const LF = 0x0a;

/** Binary iff a NUL byte occurs in the first {@link BINARY_SNIFF_BYTES} bytes. */
export function isBinaryContent(buf: Buffer): boolean {
  return buf.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/**
 * sha256 (lowercase hex) of `buf` with every `\r\n` folded to `\n` when the
 * content is text. Binary content, and text with no CR, hashes as its raw
 * bytes — so records written before the fold stay valid.
 */
export function contentHashBytes(buf: Buffer): string {
  const hash = createHash('sha256');
  let cr = buf.indexOf(CR);
  if (cr === -1 || isBinaryContent(buf)) return hash.update(buf).digest('hex');
  // One left-to-right pass, zero-copy: hash each run up to a CR that is
  // followed by an LF, then skip that CR (the LF starts the next run).
  let start = 0;
  while (cr !== -1) {
    if (buf[cr + 1] === LF) {
      hash.update(buf.subarray(start, cr));
      start = cr + 1;
    }
    cr = buf.indexOf(CR, cr + 1);
  }
  return hash.update(buf.subarray(start)).digest('hex');
}

/**
 * The comparison hash of a file: {@link contentHashBytes} of its bytes. Throws
 * if the path is unreadable, exactly like {@link sha256File}.
 */
export function contentHash(path: string): string {
  return contentHashBytes(readFileSync(path));
}

/** sha256 of a file's RAW bytes, lowercase hex. Throws if the path is unreadable. */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
