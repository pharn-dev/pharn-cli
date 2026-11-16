import { lstatSync } from 'node:fs';
import { MODELS_RECORD_KEY, type FileRecords } from './install-records.js';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { capabilitySubtree, configLayout, layoutPaths } from './layout.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';
import type { PharnConfig } from '../types.js';

/**
 * The first installed path that is PROVABLY gone, or `null` — the local,
 * read-only check that re-opens `pharn update`'s same-version early return
 * (which skips planning, so a deleted file would otherwise never be restored):
 *
 * 1. a `config.capabilities` entry whose directory is absent at the RECORDED
 *    layout;
 * 2. a key of a USABLE records store whose path is absent — except the models
 *    record (not a path) and `.claude/settings.json`, which `update` never
 *    writes and so could not restore.
 *
 * "Provably" keeps the re-open BOUNDED: every existing component is a real
 * directory and the leaf is absent — exactly the `missing → restore` row, after
 * which the next run early-returns. A symlinked component, an ENOTDIR walk or
 * a non-directory at a capability path is NOT missing: the run could not write
 * there, so re-opening would never close. Capability dirs in config order,
 * then record keys sorted; any fs error is "not provably missing".
 */
export function findMissingInstalled(
  cwd: string,
  config: PharnConfig,
  records: FileRecords | null,
): string | null {
  const paths = layoutPaths(configLayout(config));
  for (const cap of config.capabilities ?? []) {
    const rel = `${capabilitySubtree(paths, cap.role)}/${cap.name}`;
    if (provablyAbsent(cwd, rel)) return rel;
  }
  if (records === null) return null;
  for (const rel of Object.keys(records).sort()) {
    if (rel === MODELS_RECORD_KEY || rel === CLAUDE_SETTINGS_FILE) continue;
    if (provablyAbsent(cwd, rel)) return rel;
  }
  return null;
}

function provablyAbsent(base: string, rel: string): boolean {
  try {
    if (findSymlinkComponent(base, rel) !== null) return false;
    return (
      lstatSync(safeJoin(base, rel), { throwIfNoEntry: false }) === undefined
    );
  } catch {
    return false;
  }
}
