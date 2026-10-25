import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { log } from '@clack/prompts';
import { PHARN_CONFIG_FILE } from './install-manifest.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { ManifestValidationError, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The `--force` backup — the only thing standing between an explicit overwrite
// and a destroyed local edit. Copies each about-to-be-overwritten file into
// `pharn/.backup/<YYYYMMDD-HHMMSS>/`, preserving its project-relative path.
//
// The contract the caller depends on: this runs to completion BEFORE any
// original is touched, and it THROWS rather than returning partial work — so a
// failed backup aborts the update with every original still intact. (That
// ordering is deterministic control flow demonstrated by a test, NOT a floor
// primitive — labeled honestly, P0. What IS floor here is containment: every
// read and write is safeJoin-contained and lstat-guarded.)
//
// A colliding timestamp directory is NEVER written into: two `--force` runs in
// the same second must not let the second destroy the only surviving copy of the
// user's edits, so the run uniquifies instead.
//
// One axis (P3): backing up files before a forced overwrite.
// ---------------------------------------------------------------------------

// Under pharn/ for EVERY layout, beside the lock (lib/project-lock.ts), so the
// project root holds nothing of pharn's but `.claude/`, `pharn/` and the two
// JSON files. Nothing an install writes or records lives under it, so no reader
// of the install (status, orphans, drift, uninstall) ever counts a backed-up
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
 * Copy every `rels` entry from `projectRoot` into a fresh backup directory.
 * Returns the project-relative backup directory (e.g.
 * `pharn/.backup/20260807-091500`) so the caller can print it — that path is the
 * user's ONLY pointer back to their pre-overwrite bytes.
 *
 * Throws (having written no original, because the caller has not started) when
 * the backup root or any source is a symlink, when every collision suffix is
 * taken, or when any copy fails.
 */
export function createBackup(
  projectRoot: string,
  rels: string[],
  date: Date = new Date(),
): string {
  // Trust (P2): safeJoin is LEXICAL — it does not resolve symlinks. A
  // pre-existing symlink at `pharn` OR at `pharn/.backup` would let the copies
  // below land outside the project, so every component of the backup root is
  // lstat-ed and a symlinked one refused — the same way the
  // installer rejects a symlinked copy root. A component that is not a
  // directory is refused by name too, rather than surfacing as a bare ENOTDIR.
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
    // Per COMPONENT, not just the leaf — `lstat` refuses to dereference only the
    // final component, so a symlinked parent would still be read through. Shares
    // findSymlinkComponent (lib/symlink-guard.ts) with applyWrites' write side.
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
 * one, else `[]` — the config's entry in init's backup set.
 *
 * init rebuilds the file from its own fields (steps/install-archetype.ts): the
 * `seam` block is reset to pharn's default and `models` to pharn-oss's block,
 * whatever the user had tuned there. Keys pharn does not own are carried over;
 * these are not. Without a copy the one command the docs name for recovery
 * silently discarded that tuning — so the existing file is ALWAYS backed up,
 * even when it is the only file in the set. A fresh install has nothing here.
 *
 * Only a REGULAR file, at the project root: a symlink is skipped — the atomic
 * write replaces the link and never writes its target, so nothing is lost, and
 * `createBackup` would refuse it anyway; a directory is refused by the install's
 * own pre-flight. An lstat that fails (EACCES on the project root, say) → `[]`:
 * a probe, not a gate — a file that IS there but cannot be read still makes
 * `createBackup` throw, before anything is written. Shared by the
 * install (which acts) and init's overwrite prompt (which marks), so the two
 * cannot disagree about the file.
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

// Where pharn 0.13.0 and older wrote backups: a directory at the project root.
// pharn no longer writes there and never deletes it — the user's bytes may be
// the only copy — so a run that finds one only says so (legacyBackupNotice).
// The old name stays in src/ for this one purpose.
export const LEGACY_BACKUP_DIR = '.pharn-backup';

/**
 * One line pointing at an old root `.pharn-backup/` directory, or null when
 * there is none. lstat, so a symbolic link (or a file) by that name is never
 * followed or described: only a real directory is pharn's old backup root.
 * Read-only and never throws.
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
  | 'overwriting'
  | 'removing'
  | 'overwriting and removing'
  | 'moving'
  | 'overwriting and moving'
  | 'removing and moving'
  | 'overwriting, removing and moving';

// What a backup was made ahead of: overwrites (`--force` casualties), directory
// deletes and/or user-data moves (lib/root-migration.ts). With none, no backup
// exists (a backup always has a reason, so `overwriting` is the honest default).
export function backupAction(
  overwrites: boolean,
  removals: boolean,
  moves = false,
): BackupAction {
  const parts = [
    ...(overwrites ? ['overwriting'] : []),
    ...(removals ? ['removing'] : []),
    ...(moves ? ['moving'] : []),
  ];
  if (parts.length === 0) return 'overwriting';
  if (parts.length === 1) return parts[0] as BackupAction;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}` as BackupAction;
}

/** The facts a backup notice states, for every command that makes a backup. */
export interface BackupNotice {
  /** The project-relative directory `createBackup` returned. */
  dir: string;
  /** What was saved: a file count, or the one file's name. */
  saved: number | string;
  /** What the copies were made ahead of; omitted, the sentence names nothing. */
  action?: BackupAction;
}

/**
 * The backup notice's lines — ONE wording for `init`, `add`, `remove`,
 * `uninstall` and `update` (F-40: it used to be written five ways, and only
 * `update`'s carried the `.gitignore` advice).
 *
 * The pointer comes first; the advice follows it, once, when the backup is
 * made. `aborted` is `update`'s failure path, which repeats the pointer on
 * stderr (what `2> err.log` keeps) — advice, not a pointer, so it is not
 * repeated there.
 */
export function backupNoticeLines(
  notice: BackupNotice,
  opts: { aborted?: boolean } = {},
): string[] {
  const what =
    typeof notice.saved === 'number' ? `${notice.saved} file(s)` : notice.saved;
  const before = notice.action === undefined ? '' : ` before ${notice.action}`;
  const lines = [`Backed up ${what} to ${notice.dir}${before}.`];
  if (opts.aborted !== true) {
    lines.push(
      `${BACKUP_DIR}/ is not gitignored — add it to .gitignore or delete it once you are happy.`,
    );
  }
  return lines;
}

/**
 * Print the backup notice. Callers print it the moment the backup exists
 * (everything after it can still throw, and the directory is the user's only
 * pointer back to their bytes) and with NO clack spinner running — a line
 * logged under a spinner is glued to its frame, and in a narrow terminal its
 * `stop` erases it — so a caller with a spinner stops it first.
 *
 * The stream follows lib/report-error.ts's contract: an aborted run's notice is
 * part of its fatal output, so it goes to stderr; otherwise stdout.
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
