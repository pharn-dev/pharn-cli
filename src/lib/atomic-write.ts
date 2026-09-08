import { unlink, writeFile, rename } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Atomic replacement of a CLI-owned JSON file — `pharn.config.json` and
// `pharn.records.json` (lib/pharn-config.ts, lib/install-records.ts). One axis
// (P3): write a whole file or leave the old one, nothing in between.
//
// Both files were written with a plain `writeFile`, so a write torn by power
// loss or SIGKILL left truncated JSON on disk. For the records store that fails
// closed (`invalid` → every update decision degrades to `unverifiable`). For the
// config it is worse: `readPharnConfig` collapses malformed JSON to `null` and
// every command then says "No pharn.config.json found. Run `pharn init` first."
// — and that re-init resets hand-edited `models`/`seam` blocks to defaults and
// stamps every capability `source: 'auto'`, destroying manual-add provenance.
// The file exists; the message says it does not.
//
// What this DOES guarantee: the target is replaced or left alone. What it does
// NOT: it makes no PAIR of files atomic (a crash between the records write and
// the config write still leaves a stamp mismatch, which `recordsBaseline`
// already reports by name), it provides NO mutual exclusion between two
// concurrent `pharn` processes (there is no lock here), and it does not `fsync`
// — durability against a power cut at the block layer is a different claim from
// never observing a torn file, and only the second is made (P0).
// ---------------------------------------------------------------------------

/**
 * The temp path `writeJsonAtomic` writes before renaming: a SIBLING of the
 * target, in the same directory.
 *
 * The sibling placement is a precondition, not a style choice — `rename(2)` is
 * atomic only WITHIN a filesystem, and a cross-device rename fails `EXDEV`
 * rather than degrading to a copy. Keeping the temp beside the target is what
 * makes that unreachable, and it is also what keeps Node's `rename` able to
 * replace an existing destination on win32.
 *
 * The pid in the name means two concurrent `pharn` processes get distinct temps,
 * so neither can truncate the other's. That is a COLLISION property only — it is
 * NOT mutual exclusion over the target, which nothing here provides.
 */
export function tmpPathFor(target: string): string {
  return `${target}.${process.pid}.tmp`;
}

/**
 * Serialize `value` to `target` atomically: write a sibling temp, then rename it
 * over the target. Bytes are exactly what a plain `writeFile` produced —
 * `JSON.stringify(value, null, 2)` plus a trailing newline, utf8 — so no caller's
 * byte assertions change.
 *
 * On any failure the temp is unlinked BEST-EFFORT and the original error is
 * rethrown. The unlink's own error is deliberately swallowed: a cleanup failure
 * must never mask the cause. Best-effort is the honest word — a SIGKILL between
 * the write and the unlink can still leave a temp behind. The guarantee is about
 * the TARGET (replaced or untouched), not about litter.
 */
export async function writeJsonAtomic(
  target: string,
  value: unknown,
): Promise<void> {
  const tmp = tmpPathFor(target);
  try {
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
