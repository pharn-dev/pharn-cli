import { lstatSync, readdirSync } from 'node:fs';
import { contentHash } from './hash.js';
import type { FileRecords } from './install-records.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// What a capability REMOVAL would lose. `remove` deletes a capability's whole
// directory, which can hold more than pharn put there (a user's notes file, an
// edited persona). This answers which files must be backed up first:
//
//   kept OUT of the set  — the path is a key in a USABLE record store and the
//                          file's contentHash equals the record.
//   IN the set           — everything else: unrecorded files, changed files,
//                          and EVERY file when there is no usable store.
//
// Only REGULAR files are candidates: `rmSync` deletes a symlink itself, never
// its target (so the target is not being lost), a symlinked DIRECTORY is never
// descended, and opening a FIFO/socket/device to hash it could block forever.
//
// Errors PROPAGATE (EACCES, ENOTDIR): the caller refuses with nothing deleted —
// an unreadable file is never "unchanged, safe to delete". `relDirs` arrive as
// strict children of their role subtree and are safeJoin-contained again here;
// record keys are only COMPARED, never joined into a path. NOT a lock: a
// concurrent local process between this walk and the delete is not modelled.
// ---------------------------------------------------------------------------

/**
 * The project-relative posix paths under `relDirs` that must be backed up
 * before those directories are deleted, sorted and de-duplicated. `records` is
 * the validated baseline, or null when there is none. Reads only.
 */
export function removalBackupSet(
  projectRoot: string,
  relDirs: readonly string[],
  records: FileRecords | null,
): string[] {
  const out = new Set<string>();
  for (const relDir of relDirs) {
    for (const rel of regularFilesAt(projectRoot, relDir)) {
      if (!provablyPharns(projectRoot, rel, records)) out.add(rel);
    }
  }
  return [...out].sort();
}

// Every regular file at or below `rel`, as project-relative posix paths.
function* regularFilesAt(projectRoot: string, rel: string): Generator<string> {
  const stat = lstatSync(safeJoin(projectRoot, rel), { throwIfNoEntry: false });
  if (stat === undefined) return;
  // The address itself can be a regular file (`rmSync` deletes it all the same).
  if (stat.isFile()) {
    yield rel;
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(safeJoin(projectRoot, rel), {
    withFileTypes: true,
  })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) yield* regularFilesAt(projectRoot, child);
    else if (entry.isFile()) yield child;
    // symlink / FIFO / socket / device → not a candidate (see the header).
  }
}

function provablyPharns(
  projectRoot: string,
  rel: string,
  records: FileRecords | null,
): boolean {
  if (records === null || !Object.hasOwn(records, rel)) return false;
  return contentHash(safeJoin(projectRoot, rel)) === records[rel];
}
