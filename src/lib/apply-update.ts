import { lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { copyFileAtomicSync } from './atomic-write.js';
import { contentHash } from './hash.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { terminalSafe } from './terminal-safe.js';
import { ManifestValidationError, safeJoin, toPosix } from './validate.js';
import type { DiskState } from './update-decision.js';

// ---------------------------------------------------------------------------
// The per-file write executor for `pharn update`, which must act file-by-file
// because some files are left alone.
//
// `safeJoin` is LEXICAL and a plain copy FOLLOWS a symlinked destination, so
// every write refuses a symlink at its destination or any component below the
// project root.
//
// On the first failure this throws an ApplyError CARRYING the paths already
// written, so the caller can still record them: an unrecorded pharn write
// would be read as the user's edit by every later run.
//
// It is the one writer for `init`, `add` and `update`. A caller that planned
// against the destination passes what it saw (`seen`): a file edited since is
// not written but returned in `changed`, for the caller to back up or skip.
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
 * Classify what the project holds at `rel` — the disk side of the decision
 * table. Never throws: an unhashable path becomes the `unreadable` terminal.
 */
export function readDiskState(projectRoot: string, rel: string): DiskState {
  const dest = safeJoin(projectRoot, rel);
  // ONE try over both physical reads. The walk is the gate applyWrites writes
  // against (lib/symlink-guard.ts), so the read and write sides agree: `lstat`
  // resolves every ancestor, so a leaf check alone would hash through a
  // symlinked PARENT. Either call can throw (ENOTDIR under a regular file),
  // which lands in the same named terminal instead of crashing the run.
  let stat;
  try {
    const link = findSymlinkComponent(projectRoot, rel);
    if (link !== null) {
      // Name the component only when it is a PARENT: the readers already print
      // `rel` beside the reason.
      return {
        kind: 'unreadable',
        reason:
          link === toPosix(rel)
            ? 'the path is a symlink'
            : `${link} is a symlink`,
      };
    }
    stat = lstatSync(dest, { throwIfNoEntry: false });
  } catch {
    return { kind: 'unreadable', reason: 'the path could not be inspected' };
  }
  if (!stat) return { kind: 'absent' };
  if (!stat.isFile()) {
    return { kind: 'unreadable', reason: 'the path is not a regular file' };
  }
  try {
    return { kind: 'file', hash: contentHash(dest) };
  } catch {
    return { kind: 'unreadable', reason: 'the file could not be read' };
  }
}

/**
 * Has `rel` changed since the plan saw it? `seen` maps a rel to its hash at
 * plan time (`null`: absent). True only when the path is now a regular file
 * with another hash (edited, or appeared): one that vanished has nothing to
 * lose, and one now unreadable (a symlink, a directory) is left to the write's
 * own refusal. A rel `seen` does not hold was not planned against: false.
 */
export function changedSincePlan(
  projectRoot: string,
  seen: ReadonlyMap<string, string | null>,
  rel: string,
): boolean {
  if (!seen.has(rel)) return false;
  const now = readDiskState(projectRoot, rel);
  return now.kind === 'file' && now.hash !== seen.get(rel);
}

/**
 * The planned writes whose destination changed since the plan saw it, in
 * order — for a caller that must refuse BEFORE its first write rather than
 * meet the change part-way. A file that is now byte-identical to the source it
 * would be written from (`expected`: rel → absolute clone path) is left out:
 * writing it loses nothing.
 */
export function changedSince(
  projectRoot: string,
  seen: ReadonlyMap<string, string | null>,
  writes: readonly string[],
  expected: ReadonlyMap<string, string>,
): string[] {
  return writes.filter((rel) => {
    if (!changedSincePlan(projectRoot, seen, rel)) return false;
    const from = expected.get(rel);
    return (
      from === undefined ||
      contentHash(safeJoin(projectRoot, rel)) !== contentHash(from)
    );
  });
}

/**
 * Copy each planned write from the clone into the project, creating parent
 * directories (a restore whose whole directory was deleted needs them).
 * Returns the paths written, in order.
 *
 * `seen` maps a rel to the destination's hash at plan time (`null`: absent).
 * Such a file is re-read just before its write and lands in `changed`, not
 * written, when `changedSincePlan` says so.
 */
export function applyWrites(params: {
  projectRoot: string;
  // rel → absolute source path in the fetched clone (the install manifest).
  expected: ReadonlyMap<string, string>;
  writes: readonly string[];
  seen?: ReadonlyMap<string, string | null>;
}): { written: string[]; changed: string[] } {
  const { projectRoot, expected, writes, seen } = params;
  const written: string[] = [];
  const changed: string[] = [];
  for (const rel of writes) {
    const from = expected.get(rel);
    if (from === undefined) {
      throw new ApplyError(
        `Internal: no source for planned write ${rel}.`,
        written,
      );
    }
    if (seen !== undefined && changedSincePlan(projectRoot, seen, rel)) {
      changed.push(rel);
      continue;
    }
    try {
      const to = safeJoin(projectRoot, rel);
      // Refuse a destination that is, or sits under, a symlink below
      // projectRoot. readDiskState runs the same walk, but at another instant
      // (TOCTOU): this one is the security backstop. Inside the try, so the
      // refusal carries what was already written.
      const link = findSymlinkComponent(projectRoot, rel);
      if (link !== null) {
        throw new ManifestValidationError(
          `${link} is a symlink; refusing to write through it.`,
        );
      }
      mkdirSync(dirname(to), { recursive: true });
      // By replacement, never in place: writing into the destination's inode
      // would overwrite a hard-linked file outside the project, and a hard link
      // is invisible to the symlink walk (lib/atomic-write.ts).
      copyFileAtomicSync(from, to);
      written.push(rel);
    } catch (err) {
      throw new ApplyError(
        `Failed to write ${rel}: ${err instanceof Error ? err.message : String(err)}`,
        written,
      );
    }
  }
  return { written, changed };
}

const MAX_WRITTEN_SHOWN = 10;

/**
 * The warning for a write that failed part-way: how many files landed before
 * it and which (the first ten, then a count). They have no record, so the next
 * run treats them as the user's and backs up any that differ.
 */
export function writtenBeforeFailureLines(
  written: readonly string[],
): string[] {
  const shown = written
    .slice(0, MAX_WRITTEN_SHOWN)
    .map((rel) => `  ${terminalSafe(rel)}`);
  const more = written.length - shown.length;
  return [
    `${written.length} file${written.length === 1 ? ' was' : 's were'} written before the failure; no records or config were written:`,
    ...shown,
    ...(more > 0 ? [`  and ${more} more`] : []),
  ];
}
