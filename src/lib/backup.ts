import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ManifestValidationError, safeJoin } from './validate.js';

// ---------------------------------------------------------------------------
// The `--force` backup — the only thing standing between an explicit overwrite
// and a destroyed local edit. Copies each about-to-be-overwritten file into
// `.pharn-backup/<YYYYMMDD-HHMMSS>/`, preserving its project-relative path.
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

export const BACKUP_DIR = '.pharn-backup';

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
 * `.pharn-backup/20260807-091500`) so the caller can print it — that path is the
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
  // Trust (P2): safeJoin is LEXICAL — it does not resolve symlinks. A pre-existing
  // `.pharn-backup` symlink would let the copies below land outside the project,
  // so the root is lstat-rejected the same way the installer rejects a symlinked
  // copy root.
  const rootRel = BACKUP_DIR;
  const root = safeJoin(projectRoot, rootRel);
  const rootStat = lstatSync(root, { throwIfNoEntry: false });
  if (rootStat?.isSymbolicLink()) {
    throw new ManifestValidationError(
      `${BACKUP_DIR} is a symlink; refusing to write backups through it.`,
    );
  }

  const dirRel = uniqueBackupDir(projectRoot, backupTimestamp(date));
  const dir = safeJoin(projectRoot, dirRel);
  mkdirSync(dir, { recursive: true });

  for (const rel of rels) {
    const from = safeJoin(projectRoot, rel);
    // Per COMPONENT, not just the leaf — `lstat` refuses to dereference only the
    // final component, so a symlinked parent would still be read through. Mirrors
    // applyWrites' assertNoSymlinkPath on the write side.
    assertNoSymlinkComponent(projectRoot, rel, `back up ${rel}`);
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

// Refuse a path any of whose components (below `base`) is a symlink. Only
// components BELOW the root are checked — the project root itself may legitimately
// live under a symlinked ancestor (e.g. macOS `/tmp`).
function assertNoSymlinkComponent(
  base: string,
  rel: string,
  action: string,
): void {
  let current = '';
  for (const segment of rel.split('/')) {
    if (!segment) continue;
    current = current ? `${current}/${segment}` : segment;
    const stat = lstatSync(safeJoin(base, current), { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      throw new ManifestValidationError(
        `Cannot ${action}: ${current} is a symlink.`,
      );
    }
  }
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
