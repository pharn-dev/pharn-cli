import { lstatSync } from 'node:fs';
import { safeJoin, toPosix } from './validate.js';

// ---------------------------------------------------------------------------
// The shared PHYSICAL path gate — the complement to safeJoin's LEXICAL one
// (lib/validate.ts). Three call sites guarded the same hole with three
// near-identical private walks (backup.ts, apply-update.ts, install-manifest.ts),
// each repeating the same below-the-root rationale verbatim; the walk lives here
// once and each site keeps its own failure shape at the call.
//
// Trust (P2): a base may be UNTRUSTED (a degit clone's temp dir) and so may the
// rel's segments (names read from that clone). Nothing here executes or reads
// file CONTENTS — every access is an lstat, safeJoin-contained, and the returned
// value is DATA (a path string a caller interpolates into a message or tests for
// null).
//
// One axis (P3): detecting a symlinked path component.
// ---------------------------------------------------------------------------

/**
 * The first component of `rel` (below `base`) that is a symlink, or `null` when
 * none is. `safeJoin` contains the path STRING but does not resolve symlinks,
 * and both `copyFileSync` and a plain read FOLLOW one; `lstat` refuses to
 * dereference only the FINAL component — it happily resolves every ancestor — so
 * checking the leaf alone would still read or write through a symlinked parent.
 *
 * Components are checked BELOW `base` only: the base itself (a project root, or a
 * clone's temp dir) may legitimately live under a symlinked ancestor (e.g. macOS
 * `/tmp`).
 *
 * A component that does NOT EXIST is not an offender (`throwIfNoEntry: false` →
 * `null` → not a symlink → keep walking). Callers depend on this: `applyWrites`
 * creates the parent directories AFTER this walk returns, so a restore into a
 * deleted subtree must pass.
 *
 * Returns the offending accumulated POSIX path, which is what each caller's
 * message or skip decision names. Callers own the failure shape — this returns a
 * value rather than throwing a typed refusal of its own.
 *
 * It is NOT total, and the exception matters to every caller: `throwIfNoEntry:
 * false` suppresses ENOENT ONLY, so a component below a REGULAR FILE raises
 * ENOTDIR straight out of the walk (as does `safeJoin`'s escape refusal). Where
 * each caller stands differs, and is stated rather than assumed: `readDiskState`
 * wraps the call and turns it into its `unreadable` terminal; `collectDestDrift`
 * wraps it too and skips the rel, which is what keeps such a path out of the set
 * it hands `createBackup`; `applyWrites` is already inside a try, so it becomes an
 * ApplyError carrying what was written; `backup.ts` is NOT wrapped, and would
 * surface it as a fatal error — reachable only if a path with a non-directory
 * component ever reached the backup set, which `readDiskState` (for `update`) and
 * `collectDestDrift` (for `add`) each classify and skip first. Pinned by
 * tests/symlink-guard.test.ts.
 */
export function findSymlinkComponent(base: string, rel: string): string | null {
  let current = '';
  for (const segment of toPosix(rel).split('/')) {
    if (!segment) continue;
    current = current ? `${current}/${segment}` : segment;
    if (
      lstatSync(safeJoin(base, current), {
        throwIfNoEntry: false,
      })?.isSymbolicLink()
    ) {
      return current;
    }
  }
  return null;
}
