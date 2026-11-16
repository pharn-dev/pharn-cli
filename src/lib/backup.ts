import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { log } from '@clack/prompts';
import { PHARN_CONFIG_FILE } from './install-manifest.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { ManifestValidationError, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The backup in front of an overwrite or delete: copies each file into
// `pharn/.backup/<YYYYMMDD-HHMMSS>/`, preserving its project-relative path.
//
// Contract: it runs to completion BEFORE any original is touched and THROWS
// rather than returning partial work, so a failed backup aborts with every
// original intact (control flow shown by tests; containment — safeJoin plus
// lstat guards — is the hard part). A colliding timestamp directory is never
// written into: the run uniquifies, so a second run in the same second cannot
// destroy the only surviving copy.
// ---------------------------------------------------------------------------

// Under pharn/ for EVERY layout, beside the lock. Nothing an install writes or
// records lives under it, so no reader of the install ever counts a backed-up
// copy as installed — pinned by tests.
export const BACKUP_DIR = 'pharn/.backup';

// A collision means a second backup inside the same second; a small bound is
// plenty and keeps the failure loud instead of looping.
const MAX_COLLISION_SUFFIX = 100;

/** `YYYYMMDD-HHMMSS` in local time — the backup directory's name. */
export function backupTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Copy every `rels` entry from `projectRoot` into a fresh backup directory and
 * return it project-relative (e.g. `pharn/.backup/20260807-091500`) — the
 * user's ONLY pointer back to their bytes. Throws when the backup root or any
 * source crosses a symlink, every collision suffix is taken, or a copy fails.
 */
export function createBackup(
  projectRoot: string,
  rels: string[],
  date: Date = new Date(),
): string {
  // safeJoin is LEXICAL: a symlink at `pharn` or `pharn/.backup` would let the
  // copies land outside the project, so each component of the backup root is
  // lstat-ed and a symlinked or non-directory one refused by name.
  for (const rel of [BACKUP_DIR.split('/')[0]!, BACKUP_DIR]) {
    const stat = lstatSync(safeJoin(projectRoot, rel), {
      throwIfNoEntry: false,
    });
    if (stat === undefined) break;
    if (stat.isSymbolicLink()) {
      throw new ManifestValidationError(
        `${rel} is a symlink; refusing to write backups through it.`,
      );
    }
    if (!stat.isDirectory()) {
      throw new ManifestValidationError(
        `${rel} is not a directory; refusing to write backups under it.`,
      );
    }
  }

  const dirRel = uniqueBackupDir(projectRoot, backupTimestamp(date));
  const dir = safeJoin(projectRoot, dirRel);
  mkdirSync(dir, { recursive: true });

  for (const rel of rels) {
    const from = safeJoin(projectRoot, rel);
    // Per COMPONENT, not just the leaf: `lstat` dereferences every parent.
    const link = findSymlinkComponent(projectRoot, rel);
    if (link !== null) {
      throw new ManifestValidationError(
        `Cannot back up ${rel}: ${link} is a symlink.`,
      );
    }
    const stat = lstatSync(from, { throwIfNoEntry: false });
    if (!stat) {
      throw new ManifestValidationError(
        `Cannot back up ${rel}: it disappeared before the backup ran.`,
      );
    }
    const to = safeJoin(dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }

  return dirRel;
}

/**
 * `[pharn.config.json]` when a re-run `init` is about to REWRITE an existing
 * one, else `[]`. init resets `models` to pharn-oss's block (pharn-owned keys
 * are rebuilt, user keys carried), so the existing file is ALWAYS backed up.
 *
 * Only a REGULAR file: a symlink is skipped (the atomic write replaces the
 * link, never its target), a directory is refused by the install's pre-flight.
 * A failing lstat → `[]`: a probe, not a gate (an unreadable file still makes
 * `createBackup` throw before anything is written). Shared by the install and
 * init's overwrite prompt, so the two cannot disagree.
 */
export function replacedConfigBackup(projectRoot: string): string[] {
  try {
    const stat = lstatSync(safeJoin(projectRoot, PHARN_CONFIG_FILE), {
      throwIfNoEntry: false,
    });
    return stat?.isFile() === true ? [PHARN_CONFIG_FILE] : [];
  } catch {
    return [];
  }
}

// Where pharn 0.13.0 and older wrote backups. pharn never deletes it (the
// user's bytes may be the only copy); a run that finds one only says so.
export const LEGACY_BACKUP_DIR = '.pharn-backup';

/**
 * One line pointing at an old root `.pharn-backup/` directory, or null. lstat,
 * so only a real directory counts. Never throws.
 */
export function legacyBackupNotice(projectRoot: string): string | null {
  try {
    const stat = lstatSync(safeJoin(projectRoot, LEGACY_BACKUP_DIR), {
      throwIfNoEntry: false,
    });
    if (stat === undefined || !stat.isDirectory()) return null;
  } catch {
    return null;
  }
  return `${LEGACY_BACKUP_DIR}/ holds backups from pharn 0.13.0 or older; new ones go to ${BACKUP_DIR}/. pharn never deletes either — move what you still need, then delete ${LEGACY_BACKUP_DIR}/.`;
}

/** What a backup was made ahead of — the notice's closing phrase. */
export type BackupAction =
  'overwriting' | 'removing' | 'overwriting and removing';

// Overwrites and/or directory deletes. A backup always has a reason, so
// `overwriting` is the default.
export function backupAction(
  overwrites: boolean,
  removals: boolean,
): BackupAction {
  if (overwrites && removals) return 'overwriting and removing';
  return removals ? 'removing' : 'overwriting';
}

/** The facts a backup notice states, for every command that makes a backup. */
export interface BackupNotice {
  /** The project-relative directory `createBackup` returned. */
  dir: string;
  /** What was saved: a file count, or the one file's name. */
  saved: number | string;
  /** What the copies were made ahead of; omitted, the sentence names nothing. */
  action?: BackupAction;
  /**
   * `pharn/.backup/` is already out of git, or this run adds it to `.gitignore`
   * (lib/gitignore.ts → `backupDirIgnored`). True drops the advice to add it.
   */
  gitignored?: boolean;
}

/**
 * The backup notice's lines — ONE wording for every command that backs up.
 * The pointer first; then the `.gitignore` advice, only while `pharn/.backup/`
 * is not gitignored. `aborted` (`update`'s failure path, on stderr) repeats the
 * pointer without the advice.
 */
export function backupNoticeLines(
  notice: BackupNotice,
  opts: { aborted?: boolean } = {},
): string[] {
  const what =
    typeof notice.saved === 'number' ? `${notice.saved} file(s)` : notice.saved;
  const before = notice.action === undefined ? '' : ` before ${notice.action}`;
  const lines = [`Backed up ${what} to ${notice.dir}${before}.`];
  if (opts.aborted !== true && notice.gitignored !== true) {
    lines.push(
      `${BACKUP_DIR}/ is not gitignored — add it to .gitignore or delete it once you are happy.`,
    );
  }
  return lines;
}

/**
 * Print the backup notice the moment the backup exists (everything after can
 * still throw) and with NO clack spinner running — a line logged under a
 * spinner is glued to its frame and can be erased by its `stop`. An aborted
 * run's notice is fatal output, so stderr; otherwise stdout.
 */
export function printBackupNotice(
  notice: BackupNotice,
  opts: { aborted?: boolean } = {},
): void {
  const output = opts.aborted === true ? process.stderr : process.stdout;
  for (const line of backupNoticeLines(notice, opts))
    log.info(line, { output });
}

// The first free `<ts>`, `<ts>-2`, `<ts>-3`, … — never an existing directory.
function uniqueBackupDir(projectRoot: string, timestamp: string): string {
  for (let n = 1; n <= MAX_COLLISION_SUFFIX; n += 1) {
    const rel =
      n === 1
        ? `${BACKUP_DIR}/${timestamp}`
        : `${BACKUP_DIR}/${timestamp}-${n}`;
    if (!existsSync(safeJoin(projectRoot, rel))) return rel;
  }
  throw new ManifestValidationError(
    `Cannot create a backup directory: ${BACKUP_DIR}/${timestamp} and ${MAX_COLLISION_SUFFIX - 1} suffixed variants all exist.`,
  );
}
