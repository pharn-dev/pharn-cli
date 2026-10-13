import { lstatSync } from 'node:fs';
import { posix } from 'node:path';
import { sha256File } from './hash.js';
import { MODELS_RECORD_KEY, type FileRecords } from './install-records.js';
import { isInstallRootPath } from './orphans.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// What `pharn uninstall` may delete. Read-only: it classifies, it never writes.
//
// The only proof that pharn wrote a file is `pharn.records.json` — a sha256 of
// the bytes every install wrote, stamp-checked against `pharn.config.json` by the
// caller (`recordsBaseline`). Uninstall has no clone, so the install manifest is
// out of reach; the RECORD STORE is therefore the candidate list, and a file
// pharn has no record of is never a candidate at all.
//
// Every record key lands in exactly one bucket, decided in this order (P5 —
// membership tests and one byte comparison, never a guess):
//
//   outside       the key is not a path an install could have written, in
//                 either layout (isInstallRootPath, lib/orphans.ts — the same
//                 install-root set orphan detection reads through). Left alone,
//                 whatever its hash says: the store is local and committed, so a
//                 hand-edited key must not be enough to delete a user's file.
//                 Both layouts on purpose: an install that moved from `flat` to
//                 `pharn` still records its old-layout files while they exist
//                 (lib/orphans.ts carries an orphan's record), and those are
//                 pharn's bytes too.
//   unsafe        a DIRECTORY on the way to it is a symbolic link, so deleting
//                 through it would reach outside the project. The caller refuses
//                 the whole run.
//   absent        nothing is there (already gone).
//   unverifiable  something is there, but it is not a regular file (a
//                 directory, a FIFO, a symlinked leaf) or it cannot be read.
//                 Left in place.
//   edited        a regular file whose sha256 differs from its record. Left in
//                 place — uninstall never destroys the user's work.
//   delete        a regular file whose sha256 equals its record: pharn wrote
//                 exactly these bytes and nobody changed them.
//
// The `models` record key is not a file (lib/install-records.ts) and is skipped.
//
// Trust (P2): record keys are local, user-editable text. This is the one place a
// key is DELETED by, and only after isInstallRootPath accepted it, through
// safeJoin, after a symlink walk of its parent directories, and only when its
// bytes match the record. (Orphan detection reads keys under the same guard.) File
// contents are hashed, never parsed or executed.
//
// NOT a lock (stated, P0): the classification reads the tree at time T and the
// delete runs at T+1; the caller re-plans under the project lock, which keeps
// other pharn writers out but not an unrelated local process.
//
// One axis (P3): which recorded files an uninstall may delete.
// ---------------------------------------------------------------------------

export interface UninstallPlan {
  delete: string[];
  edited: string[];
  unverifiable: string[];
  absent: string[];
  outside: string[];
  unsafe: { rel: string; component: string }[];
}

/** Classify every record key. Sorted buckets; reads only. */
export function planUninstall(
  projectRoot: string,
  records: FileRecords,
): UninstallPlan {
  const plan: UninstallPlan = {
    delete: [],
    edited: [],
    unverifiable: [],
    absent: [],
    outside: [],
    unsafe: [],
  };
  for (const rel of Object.keys(records).sort()) {
    if (rel === MODELS_RECORD_KEY) continue;
    if (!isInstallRootPath(rel)) {
      plan.outside.push(rel);
      continue;
    }
    const verdict = classify(projectRoot, rel, records[rel]!);
    if (typeof verdict === 'object') plan.unsafe.push(verdict);
    else plan[verdict].push(rel);
  }
  return plan;
}

type Verdict =
  | 'delete'
  | 'edited'
  | 'unverifiable'
  | 'absent'
  | { rel: string; component: string };

function classify(projectRoot: string, rel: string, recorded: string): Verdict {
  // The PARENT chain only: a symlinked leaf is not a way out of the project for
  // an unlink (it would remove the link), but it is not pharn's file either, so
  // it is left as `unverifiable` below rather than refused here.
  let linked: string | null;
  try {
    const parent = posix.dirname(rel);
    // A root-level file has no parent below the project root to walk.
    linked = parent === '.' ? null : findSymlinkComponent(projectRoot, parent);
  } catch {
    // ENOTDIR: a component on the way is a regular file, so nothing can be at
    // this path. (The walk's only other throw, safeJoin's escape refusal, is
    // unreachable: the store's ingest rule already rejected `..` segments.)
    return 'absent';
  }
  if (linked !== null) return { rel, component: linked };

  const abs = safeJoin(projectRoot, rel);
  let stat;
  try {
    stat = lstatSync(abs, { throwIfNoEntry: false });
  } catch (err) {
    // ENOTDIR: the parent is a regular file, so nothing can be here.
    return (err as NodeJS.ErrnoException).code === 'ENOTDIR'
      ? 'absent'
      : 'unverifiable';
  }
  if (stat === undefined) return 'absent';
  if (!stat.isFile()) return 'unverifiable';
  let hash: string;
  try {
    hash = sha256File(abs);
  } catch {
    // Unreadable bytes are not provably pharn's — fail closed: keep the file.
    return 'unverifiable';
  }
  return hash === recorded ? 'delete' : 'edited';
}
