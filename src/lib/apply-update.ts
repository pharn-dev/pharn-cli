import { copyFileSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256File } from './hash.js';
import { ManifestValidationError, safeJoin } from './validate.js';
import type { DiskState } from './update-decision.js';

// ---------------------------------------------------------------------------
// The per-file write executor for `pharn update`. `init`/`add` copy whole dirs
// (lib/install-capabilities.ts); an update must act file-by-file, because the
// whole point is that SOME files are left alone.
//
// Trust (P2): `safeJoin` is LEXICAL — it contains the path string but does not
// resolve symlinks, and `copyFileSync` FOLLOWS a symlinked destination. So every
// write lstat-checks its destination and each parent component created below the
// project root, and refuses to write through a symlink. (This closes the same
// hole the existing recursive `cpSync` install path still has for capability
// dirs — noted honestly: this increment inherits that gap and fixes it here.)
//
// Failure contract (replacing the whole-dir copy's "no partial installs"): on the
// first failure this throws an ApplyError CARRYING the paths already written, so
// the caller can still record them. Files pharn wrote must never be left
// unrecorded — the next run would read them as the user's edits and refuse to
// touch them forever.
//
// One axis (P3): applying an update plan to the filesystem.
// ---------------------------------------------------------------------------

export class ApplyError extends Error {
  constructor(
    message: string,
    // Project-relative paths successfully written before the failure.
    public written: string[],
  ) {
    super(message);
    this.name = 'ApplyError';
  }
}

/**
 * Does a component of `rel` exist but not as a directory, so that `rel` CANNOT
 * exist? Only components BELOW `projectRoot` are examined — what sits above the
 * root is not pharn's business and may legitimately be unreadable.
 *
 * Errno-free on purpose: it observes what the components ARE rather than what
 * failing to stat one reported, so it answers identically on every platform.
 * A component that cannot be inspected at all counts as blocking — "I could not
 * look" must never render as "there was nothing there".
 */
function parentBlocks(projectRoot: string, rel: string): boolean {
  // Walk segments outward-in from the root, the same way `assertNoSymlinkPath`
  // below does — an outer component being a file is the REASON an inner one
  // cannot be inspected, so the outermost answer is the true one. Segment-walking
  // also keeps containment structural (`safeJoin` per step) rather than resting on
  // a lexical prefix compare, which would confuse `/a/b` with `/a/bc`.
  const segments = rel.split('/').filter((s) => s.length > 0);
  let current = '';
  for (const segment of segments.slice(0, -1)) {
    current = current ? `${current}/${segment}` : segment;
    let st;
    try {
      st = lstatSync(safeJoin(projectRoot, current), { throwIfNoEntry: false });
    } catch {
      return true;
    }
    if (!st) return false; // a genuinely missing directory — the path is absent, not blocked
    // A SYMLINKED parent is deliberately not blocking. It does not mean the path
    // cannot exist — refusing to write THROUGH a symlink is `applyWrites`' job
    // (see the trust note at the top of this file), and deciding it here would
    // turn a planned write into a silent skip and dissolve the ApplyError
    // contract. When the link points at a file, the lstat above already raises
    // ENOTDIR on POSIX and this function is never consulted.
    if (st.isSymbolicLink()) continue;
    if (!st.isDirectory()) return true;
  }
  return false;
}

/**
 * Classify what the project holds at `rel` — the disk side of the decision
 * table. Never throws: an unhashable path becomes the `unreadable` terminal so
 * the run reports it instead of crashing (P5).
 */
export function readDiskState(projectRoot: string, rel: string): DiskState {
  const dest = safeJoin(projectRoot, rel);
  // Catching keeps the terminal deterministic (P5): unreadable, reported, never
  // silently overwritten. The `absent` split below is deliberately NOT decided by
  // errno — see `parentBlocks`.
  let stat;
  try {
    stat = lstatSync(dest, { throwIfNoEntry: false });
  } catch {
    return { kind: 'unreadable', reason: 'the path could not be inspected' };
  }
  // Not found. "Not found" and "cannot exist" are different terminals, and which
  // errno distinguishes them is PLATFORM-SPECIFIC: POSIX raises ENOTDIR when a
  // parent component is a regular file, Windows raises ENOENT for that same
  // situation. Reading the errno therefore classified a blocked path as `absent`
  // on Windows — so `status` called it Missing (implying it can be restored) and
  // `update` planned a restore that then crashed. Ask the filesystem what is
  // actually there instead (P5: a membership test over real components, not an
  // errno guess). Costs extra lstats only on this already-not-found branch.
  if (!stat) {
    return parentBlocks(projectRoot, rel)
      ? {
          kind: 'unreadable',
          reason: 'a parent of the path is not a directory',
        }
      : { kind: 'absent' };
  }
  if (stat.isSymbolicLink()) {
    return { kind: 'unreadable', reason: 'the path is a symlink' };
  }
  if (!stat.isFile()) {
    return { kind: 'unreadable', reason: 'the path is not a regular file' };
  }
  try {
    return { kind: 'file', hash: sha256File(dest) };
  } catch {
    return { kind: 'unreadable', reason: 'the file could not be read' };
  }
}

/**
 * Copy each planned write from the clone into the project, creating parent
 * directories (`copyFileSync` does not, unlike the recursive `cpSync` this
 * replaces — a restore whose whole directory was deleted depends on it).
 * Returns the paths written, in order.
 */
export function applyWrites(params: {
  projectRoot: string;
  // rel → absolute source path in the fetched clone (the install manifest).
  expected: Map<string, string>;
  writes: string[];
}): string[] {
  const { projectRoot, expected, writes } = params;
  const written: string[] = [];
  for (const rel of writes) {
    const from = expected.get(rel);
    if (from === undefined) {
      throw new ApplyError(
        `Internal: no source for planned write ${rel}.`,
        written,
      );
    }
    try {
      const to = safeJoin(projectRoot, rel);
      assertNoSymlinkPath(projectRoot, rel);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      written.push(rel);
    } catch (err) {
      throw new ApplyError(
        `Failed to write ${rel}: ${err instanceof Error ? err.message : String(err)}`,
        written,
      );
    }
  }
  return written;
}

/**
 * Refuse a destination that is a symlink, or that sits under one, anywhere below
 * `projectRoot`. Only components BELOW the root are checked — the project root
 * itself may legitimately live under a symlinked ancestor (e.g. macOS `/tmp`).
 */
function assertNoSymlinkPath(projectRoot: string, rel: string): void {
  const segments = rel.split('/').filter((s) => s.length > 0);
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const stat = lstatSync(safeJoin(projectRoot, current), {
      throwIfNoEntry: false,
    });
    if (stat?.isSymbolicLink()) {
      throw new ManifestValidationError(
        `${current} is a symlink; refusing to write through it.`,
      );
    }
  }
}
