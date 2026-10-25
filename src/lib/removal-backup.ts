import { lstatSync, readdirSync } from 'node:fs';
import { contentHash } from './hash.js';
import type { FileRecords } from './install-records.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// What a capability REMOVAL would lose. `pharn remove` deletes a capability's
// whole directory (`rmSync(..., { recursive: true })`), and that directory can
// hold more than pharn put there: a notes file the user added, or an edit to a
// persona file. This answers which of its files must be copied to
// `pharn/.backup/<ts>/` (lib/backup.ts) before the delete, so the removal stops
// being final for anything that is not provably pharn's own bytes.
//
// The rule is one membership test and one content-hash comparison (P5):
//
//   kept OUT of the set  — the path is a key in a USABLE record store and the
//                          file's contentHash equals the record: pharn wrote
//                          exactly these bytes, and the next install can write
//                          them again.
//   IN the set           — everything else: a file pharn has no record of, a
//                          recorded file whose bytes changed, and EVERY file when
//                          there is no usable store (`records === null` — absent,
//                          corrupt, or stamped for another install state, per
//                          `recordsBaseline`). Without a store nothing is
//                          provable, so nothing is assumed.
//
// Only REGULAR files are candidates. A symbolic link is neither followed nor
// backed up: `rmSync` deletes the link itself and never touches its target, and
// copying the target's bytes would save something that is not being lost. A
// FIFO, socket or device is skipped too — opening a FIFO to hash or copy it
// blocks forever. A symlinked DIRECTORY is never descended (its Dirent is not
// `isDirectory()`), for the same reason.
//
// Errors PROPAGATE (EACCES on a listing or a hash, ENOTDIR): the caller turns
// them into a refusal with nothing deleted. An unreadable file must never be
// treated as "unchanged, safe to delete" — fail closed.
//
// Trust (P2): `remove` is zero-network, so nothing here is fetched. `relDirs`
// come from validated config names, addressed by the caller as strict children
// of their role subtree (safeChildJoin) BEFORE they reach this function; every
// path is `safeJoin`-contained again here. Record keys are only COMPARED as
// strings, never joined into a path, so a hand-edited store cannot steer a read.
// File contents are hashed, never parsed or executed.
//
// NOT a lock (stated, P0): the walk reads the tree at time T and the delete runs
// at T+1. The project lock keeps other pharn writers out; a concurrent local
// process changing files in between is the same unmodelled local race the rest
// of the CLI names (lib/dest-drift.ts).
//
// One axis (P3): which files a capability removal would lose.
// ---------------------------------------------------------------------------

/**
 * The project-relative posix paths under `relDirs` that must be backed up
 * before those directories are deleted — sorted and de-duplicated. `records`
 * is the validated baseline (`recordsBaseline(...).records`), or null when
 * there is none to trust. Reads only; writes nothing.
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
  // The address itself can be a regular file: `rmSync` would delete it all the
  // same, so it is judged like any other file.
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
