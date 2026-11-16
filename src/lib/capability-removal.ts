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
// capabilities from the config, and what it must save first — shared by
// `pharn update` and a re-run `pharn init` so the two decide identically.
//
// Why a drop deletes: PHARN's commands find grillers and lenses by SCANNING
// these directories, not `capabilities[]`, so a dropped directory would keep
// running, unaddressable by any pharn command.
//
// Reads only: each directory is a strict child of its role subtree
// (lib/capability-dir.ts), a symlinked component is refused, and
// lib/removal-backup.ts names the files not provably pharn's. Deleting is the
// caller's, after its backup.
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
  // installed and how its records are keyed.
  dir: string;
  // Whether there is anything at that address to delete.
  present: boolean;
  // Files backed up before the delete: every regular file not provably
  // pharn's own unchanged bytes. Sorted.
  backups: string[];
}

/**
 * A dropped capability's directory must not be deleted (a symlinked component,
 * or a file that cannot be checked). Thrown while PLANNING, before any write,
 * with a complete user-facing message.
 */
export class CapabilityRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityRemovalError';
  }
}

/**
 * One removal per dropped capability (first per `role:name`), addressed at
 * `paths` and judged against `records` (the usable baseline, or null). Reads
 * only. Refuses rather than plan an unsafe delete: a symlinked component
 * (`rmSync` would follow it out of the project), or an unreadable file (never
 * "pharn's own, safe to delete" — fail closed). A path below a regular file is
 * simply not present.
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
