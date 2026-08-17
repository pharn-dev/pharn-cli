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
 * value and never throws (beyond `safeJoin`'s own escape refusal).
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
