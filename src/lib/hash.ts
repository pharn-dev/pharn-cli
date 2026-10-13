import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// The content-hash primitive (ARCHITECTURE.md §2 #2 — identity of CONTENT, not
// of id). One canonical implementation so the drift check (status), the install
// record store, the update decision, add/init's destination-drift scan and
// remove's backup set can never disagree about what "the same content" means.
// One axis (P3): how a file's content identity is computed.
//
// `contentHash` is THE comparison hash. It folds CRLF → LF in text files before
// hashing, so a project committed and re-checked-out with `core.autocrlf=true`
// (typical on Windows) does not read every installed file as edited (F-16). The
// fold is pharn-oss's own (pharn/floor/check-spec.mjs `bodyHash`,
// `body.replace(/\r\n/g, "\n")`): only a CR immediately followed by an LF is
// dropped; a lone CR is byte-exact. Its cost, stated: a change that ONLY swaps
// line endings in a text file is not a change to pharn.
//
// `sha256File` is the RAW byte hash. No comparison of installed content may use
// it (tests/hash.test.ts pins that no file under src/ but this one calls it);
// it stays for a true byte pin, e.g. the vendored checker in
// tests/model-config-parity.test.ts.
//
// Whole-file read (not a stream), matching what lib/diff.ts has always done for
// the same file set — the copied surfaces are markdown/`.cjs`/`.mjs`/`.json`.
// Streaming here while diff.ts buffers would fork the two; the cost is recorded
// in the increment's grill log rather than silently traded away.
// ---------------------------------------------------------------------------

/**
 * How many leading bytes are sniffed for a NUL. 8000 is git's own sniff size
 * (FIRST_FEW_BYTES). Why that makes the rule safe is ADVISORY (it describes
 * git, which this repo does not test): git does not line-convert content that
 * contains a NUL, so a file this rule calls binary is one `core.autocrlf` left
 * byte-exact. The rule can only err toward "text", which merely makes a
 * CRLF↔LF-only change in such a file invisible.
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
 * content is text; binary content (and text with no CR at all) hashes exactly
 * as its raw bytes — so an LF-only file's content hash IS its raw sha256, and
 * every record written before the fold stays valid.
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
