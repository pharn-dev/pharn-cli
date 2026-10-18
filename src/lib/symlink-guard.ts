import { lstatSync } from 'node:fs';
import { safeJoin, toPosix } from './validate.js';

// ---------------------------------------------------------------------------
// The shared PHYSICAL path gate — the complement to safeJoin's LEXICAL one
// (lib/validate.ts). Three call sites guarded the same hole with three
// near-identical private walks (backup.ts, apply-update.ts, install-manifest.ts),
// each repeating the same below-the-root rationale verbatim; the walk lives here
// once and each site keeps its own failure shape at the call.
//
// Trust (P2): a base may be UNTRUSTED (the temp dir a fetched codeload tarball
// was extracted into) and so may the rel's segments (names read from that tree).
// Nothing here executes or reads file CONTENTS — every access is an lstat,
// safeJoin-contained, and the returned value is DATA (a path string a caller
// interpolates into a message or tests for null).
//
// One axis (P3): walking a path's components on disk — a symlinked component
// (findSymlinkComponent) or one whose type blocks a write (findTypeCollision).
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
 * wraps the call and turns it into its `unreadable` terminal; `scanDest`
 * wraps it too and skips the rel, which is what keeps such a path out of the set
 * it hands `createBackup`; `applyWrites` is already inside a try, so it becomes an
 * ApplyError carrying what was written; `backup.ts` is NOT wrapped, and would
 * surface it as a fatal error — reachable only if a path with a non-directory
 * component ever reached the backup set, which `readDiskState` (for `update`) and
 * `scanDest` (for `add` and a re-run `init`) each classify and skip first.
 * Pinned by tests/symlink-guard.test.ts.
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

/**
 * `findSymlinkComponent` made total: the walk's answer, or the caller's
 * `unwalkable` value when the walk THROWS — ENOTDIR (a component below a regular
 * file), or anything else it raises (EACCES, ELOOP, `safeJoin`'s escape
 * refusal). Every throw, not ENOTDIR alone: that is the breadth of the three
 * private wrappers this replaced, kept exactly. What the fallback MEANS is the
 * caller's decision, which is why it is a parameter: `null` ("no symlink here")
 * for `remove`/`update`'s capability deletes (`linkedComponent`) and `init`'s
 * destination pre-flight, a sentinel ("cannot answer" → skip) for `scanDest`.
 * A caller that must fail on a throw calls `findSymlinkComponent` itself.
 */
export function findSymlinkComponentOr<T>(
  base: string,
  rel: string,
  unwalkable: T,
): string | null | T {
  try {
    return findSymlinkComponent(base, rel);
  } catch {
    return unwalkable;
  }
}

/**
 * The first component of `rel` below `base` whose existing type blocks
 * the write, or `null`. Intermediate components must be directories; the leaf
 * must be a regular file (or absent). Components that do not exist pass —
 * the copy creates them. The walk stops at the first offender, so a path below
 * a regular file is never lstat-ed (no ENOTDIR). Used by `init`'s destination
 * pre-flight (install-capabilities.ts), which owns the failure shape.
 */
export function findTypeCollision(base: string, rel: string): string | null {
  const segments = toPosix(rel).split('/').filter(Boolean);
  let current = '';
  for (const [i, segment] of segments.entries()) {
    current = current ? `${current}/${segment}` : segment;
    const stat = lstatSync(safeJoin(base, current), {
      throwIfNoEntry: false,
    });
    if (stat === undefined) return null;
    const isLeaf = i === segments.length - 1;
    if (isLeaf ? !stat.isFile() : !stat.isDirectory()) return current;
  }
  return null;
}
