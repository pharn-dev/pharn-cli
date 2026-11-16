import { lstatSync } from 'node:fs';
import { posix } from 'node:path';
import { contentHash } from './hash.js';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { MODELS_RECORD_KEY, type FileRecords } from './install-records.js';
import { isInstallRootPath } from './orphans.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// What `pharn uninstall` may delete. Read-only: it classifies, it never writes.
//
// The only proof that pharn wrote a file is `pharn.records.json` (validated by
// the caller; its stamp is never a gate). Uninstall has no clone, so the RECORD
// STORE is the candidate list: a file with no record is never a candidate.
//
// Every record key lands in exactly one bucket, decided in this order:
//
//   outside       not a path an install could have written in either layout
//                 (isInstallRootPath). Left alone whatever its hash says, so a
//                 hand-edited key cannot delete a user's file. Both layouts on
//                 purpose: a moved install still records its old-layout files.
//                 ONE other key is admitted by exact equality:
//                 `.claude/settings.json`, recorded when a fresh `init` wrote it
//                 (not an install-root path, which would make it an orphan and
//                 a `.prettierignore` line).
//   unsafe        a DIRECTORY on the way is a symbolic link, so the delete would
//                 reach outside the project. The caller refuses the whole run.
//   absent        nothing is there.
//   unverifiable  not a regular file (a directory, a FIFO, a symlinked leaf),
//                 or unreadable. Left in place.
//   edited        a regular file whose contentHash differs from its record.
//                 Left in place.
//   delete        a regular file whose contentHash equals its record.
//
// The `models` record key is not a file and is skipped. Record keys are local,
// user-editable text: this is the one place a key is DELETED by, and only after
// the bound above, through safeJoin, after a symlink walk of its parents, on a
// matching hash. NOT a lock: the caller plans under the project lock, which
// keeps other pharn writers out but not an unrelated local process, and
// re-classifies the `delete` bucket after its confirm (reclassifyDeletes).
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
    if (rel !== CLAUDE_SETTINGS_FILE && !isInstallRootPath(rel)) {
      plan.outside.push(rel);
      continue;
    }
    const verdict = classify(projectRoot, rel, records[rel]!);
    if (typeof verdict === 'object') plan.unsafe.push(verdict);
    else plan[verdict].push(rel);
  }
  return plan;
}

/**
 * `plan` with its `delete` bucket classified again, by the same rule, at
 * delete time: the plan was made before a confirm that may have sat open, so a
 * file edited since moves to `edited` (kept), one gone to `absent`, and a
 * parent swapped to a link to `unsafe` (the caller refuses the run). The other
 * buckets stand: a file is only ever moved away from `delete`. Reads only.
 */
export function reclassifyDeletes(
  projectRoot: string,
  records: FileRecords,
  plan: UninstallPlan,
): UninstallPlan {
  const subset: FileRecords = {};
  for (const rel of plan.delete) subset[rel] = records[rel]!;
  const now = planUninstall(projectRoot, subset);
  const merged = (a: string[], b: string[]): string[] => [...a, ...b].sort();
  return {
    delete: now.delete,
    edited: merged(plan.edited, now.edited),
    unverifiable: merged(plan.unverifiable, now.unverifiable),
    absent: merged(plan.absent, now.absent),
    outside: plan.outside,
    unsafe: [...plan.unsafe, ...now.unsafe],
  };
}

type Verdict =
  | 'delete'
  | 'edited'
  | 'unverifiable'
  | 'absent'
  | { rel: string; component: string };

function classify(projectRoot: string, rel: string, recorded: string): Verdict {
  // The PARENT chain only: a symlinked leaf is no way out for an unlink (it
  // removes the link), but it is not pharn's file either → `unverifiable`.
  let linked: string | null;
  try {
    const parent = posix.dirname(rel);
    // A root-level file has no parent below the project root to walk.
    linked = parent === '.' ? null : findSymlinkComponent(projectRoot, parent);
  } catch {
    // ENOTDIR: a component on the way is a regular file, so nothing is here.
    // (safeJoin's escape refusal is unreachable: ingest rejects `..`.)
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
    hash = contentHash(abs);
  } catch {
    // Unreadable bytes are not provably pharn's — fail closed: keep the file.
    return 'unverifiable';
  }
  return hash === recorded ? 'delete' : 'edited';
}
