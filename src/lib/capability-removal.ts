import { existsSync } from 'node:fs';
import {
  capabilityDir,
  capabilityRelDir,
  linkedComponent,
} from './capability-dir.js';
import type { FileRecords } from './install-records.js';
import type { LayoutPaths } from './layout.js';
import { removalBackupSet } from './removal-backup.js';
import { errorMessage } from './report-error.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Which capability directories a run deletes because it DROPS those
// capabilities from `pharn.config.json`, and what it must save first. Shared by
// `pharn update` (merge rows 5/7/9, lib/update-plan.ts) and a re-run
// `pharn init` (carryOver, lib/init-plan.ts), so the two decide it identically.
//
// Why a drop deletes: PHARN's commands find the grillers and lenses they run by
// SCANNING these directories, not by reading `capabilities[]`. A dropped entry
// whose directory stayed would keep running — and, with no config entry, no
// pharn command could address it any more.
//
// Reads only (P0): it addresses each directory through lib/capability-dir.ts
// (strict child of its role subtree), refuses a symlinked component, and asks
// lib/removal-backup.ts which regular files are not provably pharn's own bytes.
// Deleting is the caller's, after it has made the backup.
//
// One axis (P3): the removal plan for dropped capabilities.
// ---------------------------------------------------------------------------

/** Why a capability leaves the config — `update`'s two DROP reasons. */
export type DropReason = 'dropped-unselected' | 'dropped-gone';

export interface CapabilityDrop {
  cap: InstalledCapability;
  reason: DropReason;
}

/** A dropped capability's directory, and what deleting it would lose. */
export interface CapabilityRemoval {
  cap: InstalledCapability;
  reason: DropReason;
  // `<subtree>/<name>` at the layout the CONFIG recorded — where it was
  // installed, where `remove` addresses it, and how its records are keyed.
  dir: string;
  // Whether there is anything at that address to delete.
  present: boolean;
  // Project-relative files copied to `pharn/.backup/` before the delete: every
  // regular file in it that is not provably pharn's own unchanged bytes
  // (lib/removal-backup.ts). Sorted.
  backups: string[];
}

/**
 * A dropped capability's directory must not be deleted: a symlinked component
 * on the way to it, or a file in it that cannot be checked. Thrown while
 * PLANNING, before anything is written; the message is complete and user-facing
 * (a named refusal, not a crash).
 */
export class CapabilityRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityRemovalError';
  }
}

/**
 * One removal per dropped capability (first per `role:name` — a duplicated
 * config entry is one directory), addressed at `paths` (the layout the config
 * being replaced recorded) and judged against `records` (its usable baseline,
 * or null). Reads only.
 *
 * Refuses (CapabilityRemovalError) rather than plan a delete it cannot make
 * safely: a symlinked component on the way (`rmSync` would follow it out of the
 * project), or a file it cannot read (an unreadable file must never be treated
 * as "pharn's own, safe to delete" — fail closed). A path below a regular file
 * cannot hold a directory, so it is simply not present. `command` names the
 * run in the refusal ("update", "init").
 */
export function planCapabilityRemovals(params: {
  cwd: string;
  paths: LayoutPaths;
  drops: readonly CapabilityDrop[];
  records: FileRecords | null;
  command: 'update' | 'init';
}): CapabilityRemoval[] {
  const { cwd, paths, drops, records, command } = params;
  const removals: CapabilityRemoval[] = [];
  const seen = new Set<string>();
  for (const { cap, reason } of drops) {
    const key = `${cap.role}:${cap.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${cap.name} (${cap.role})`;
    // A refused name keeps its own `Refusing path` error (strict child).
    const abs = capabilityDir(cwd, paths, cap);
    const dir = capabilityRelDir(paths, cap);
    const linked = linkedComponent(cwd, paths, cap);
    if (linked !== null) {
      throw new CapabilityRemovalError(
        `Refusing to ${command}: ${label} is no longer installed, so its directory ${dir} would be deleted — but ${linked} is a symbolic link, and deleting through it would delete files OUTSIDE the project. Nothing was changed. Delete ${dir} yourself, then run \`pharn ${command}\` again.`,
      );
    }
    let present: boolean;
    let backups: string[];
    try {
      present = existsSync(abs);
      backups = present ? removalBackupSet(cwd, [dir], records) : [];
    } catch (err) {
      throw new CapabilityRemovalError(
        `Could not check the files in ${label} before removing it: ${errorMessage(err).replace(/\.$/, '')}. Nothing was changed.`,
      );
    }
    removals.push({ cap, reason, dir, present, backups });
  }
  return removals;
}

/** Every file the removals back up, de-duplicated, in plan order. */
export function removalBackups(
  removals: readonly CapabilityRemoval[],
): string[] {
  return [...new Set(removals.flatMap((r) => r.backups))];
}
