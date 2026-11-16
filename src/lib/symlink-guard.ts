import { lstatSync } from 'node:fs';
import { safeJoin, toPosix } from './validate.js';

// ---------------------------------------------------------------------------
// The shared PHYSICAL path gate — the complement to safeJoin's LEXICAL one
// (lib/validate.ts): walking a path's components on disk for a symlinked
// component or one whose type blocks a write. Each caller keeps its own failure
// shape. Every access is a safeJoin-contained lstat; nothing reads contents.
// ---------------------------------------------------------------------------

/**
 * The first component of `rel` below `base` that is a symlink (its accumulated
 * POSIX path), or `null`. `lstat` dereferences every ancestor, so checking the
 * leaf alone would still go through a symlinked parent. The base itself may sit
 * under a symlinked ancestor (macOS `/tmp`), so only components below it count.
 * A component that does not exist passes (`applyWrites` creates parents after
 * this walk).
 *
 * NOT total: a component below a REGULAR FILE raises ENOTDIR (as does
 * `safeJoin`'s escape refusal). `readDiskState` and `scanDest` classify such a
 * path before it can reach `backup.ts`, which does not wrap the call. Pinned by
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

/**
 * `findSymlinkComponent` made total: the caller's `unwalkable` value on ANY
 * throw of the walk (ENOTDIR, EACCES, ELOOP, the escape refusal). What that
 * means is the caller's call — `null` for the capability deletes and `init`'s
 * pre-flight, a skip sentinel for `scanDest`. A caller that must fail on a
 * throw calls `findSymlinkComponent` itself.
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
 * The first component of `rel` below `base` whose existing type blocks the
 * write, or `null`: intermediates must be directories, the leaf a regular file
 * (or absent). Stops at the first offender, so it never raises ENOTDIR.
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
