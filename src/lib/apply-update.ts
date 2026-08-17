import { copyFileSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256File } from './hash.js';
import { findSymlinkComponent } from './symlink-guard.js';
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
 * Classify what the project holds at `rel` — the disk side of the decision
 * table. Never throws: an unhashable path becomes the `unreadable` terminal so
 * the run reports it instead of crashing (P5).
 */
export function readDiskState(projectRoot: string, rel: string): DiskState {
  const dest = safeJoin(projectRoot, rel);
  // `throwIfNoEntry: false` suppresses ENOENT ONLY — a path whose PARENT is a
  // regular file raises ENOTDIR, which would crash the whole run instead of
  // producing the named skip this function promises. Catching keeps the terminal
  // deterministic (P5): unreadable, reported, never silently overwritten.
  let stat;
  try {
    stat = lstatSync(dest, { throwIfNoEntry: false });
  } catch {
    return { kind: 'unreadable', reason: 'the path could not be inspected' };
  }
  if (!stat) return { kind: 'absent' };
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
      // Refuse a destination that is a symlink, or that sits under one, anywhere
      // below projectRoot — the shared physical gate (lib/symlink-guard.ts),
      // which backup.ts uses on the read side. Inside the try, so the refusal is
      // wrapped into an ApplyError carrying what was already written.
      const link = findSymlinkComponent(projectRoot, rel);
      if (link !== null) {
        throw new ManifestValidationError(
          `${link} is a symlink; refusing to write through it.`,
        );
      }
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
