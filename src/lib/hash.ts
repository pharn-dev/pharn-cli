import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// The content-hash primitive (ARCHITECTURE.md §2 #2 — identity of CONTENT, not
// of id). One canonical implementation so the drift check (status), the install
// record store, and the update decision can never disagree about what "the same
// bytes" means. One axis (P3): how a file's content identity is computed.
//
// Whole-file read (not a stream), matching what lib/diff.ts has always done for
// the same file set — the copied surfaces are markdown/`.cjs`/`.mjs`/`.json`.
// Streaming here while diff.ts buffers would fork the two; the cost is recorded
// in the increment's grill log rather than silently traded away.
// ---------------------------------------------------------------------------

/** sha256 of a file's bytes, lowercase hex. Throws if the path is unreadable. */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
