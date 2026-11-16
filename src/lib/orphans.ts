import pc from './color.js';
import { readDiskState } from './apply-update.js';
import { capabilityOf, isInstallRootPath } from './install-surfaces.js';
import type { FileRecords } from './install-records.js';
import { terminalSafe } from './terminal-safe.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Orphaned files — files pharn RECORDED writing that the install no longer
// owns (upstream stopped shipping them) but that are still on disk. `update`
// never deletes them (only a DROPPED capability's directory, whose keys are
// excluded here), so without this they would sit in `.claude/commands/` (still
// live slash commands), `.claude/hooks/` or the floor dir, unnamed.
//
// Read-only. `findOrphans` returns the orphans' records so `update` / a re-run
// `init` can CARRY them, which keeps an orphan listed until its file is gone.
//
// `pharn.records.json` is hand-editable, and this is one of the TWO places a
// record KEY becomes a path (the other is `pharn uninstall`) — here only for a
// READ, and only when the key passed the store's ingest rule, is an install
// path some install could have written (`isInstallRootPath`, so a hand-added
// `src/auth.ts` key is never read), and is safeJoin-contained with no
// symlinked component and a regular file (readDiskState; a FIFO is never
// opened).
// ---------------------------------------------------------------------------

// Re-exported: its importers predate lib/install-surfaces.ts.
export { isInstallRootPath };

export type OrphanState = 'unchanged' | 'edited' | 'unreadable';

export interface Orphan {
  path: string;
  state: OrphanState;
  // Present only for `unreadable`: why the path could not be hashed.
  reason?: string;
}

export interface OrphanScan {
  // Sorted by path (code unit).
  orphans: Orphan[];
  // The orphans' PREVIOUS records, to be carried into the next store.
  records: FileRecords;
}

// Each group of the text note shows at most this many paths; `--json` has all.
export const MAX_ORPHANS_PER_GROUP = 20;

/**
 * The recorded files the install no longer owns that still exist on disk: a
 * key of a usable store that is not in `expected`, is an install path, is not
 * inside a `frozen` capability's dir (the caller carries those) nor a
 * capability outside `capabilities` (a DROPPED one keeps the plain prune), and
 * still has something there. `unchanged` = hash equals the record, `edited` =
 * it does not, `unreadable` = not a readable regular file (with the reason).
 * A key whose file is gone is dropped.
 */
export function findOrphans(params: {
  projectRoot: string;
  records: FileRecords | null;
  expected: ReadonlyMap<string, unknown>;
  // The capabilities the install still owns files for (`frozen` wins).
  capabilities: readonly InstalledCapability[];
  frozen: readonly InstalledCapability[];
}): OrphanScan {
  const { projectRoot, records, expected } = params;
  if (records === null) return { orphans: [], records: {} };
  const key = (cap: InstalledCapability): string => `${cap.role}:${cap.name}`;
  const owned = new Set(params.capabilities.map(key));
  const frozen = new Set(params.frozen.map(key));

  const orphans: Orphan[] = [];
  const carried: FileRecords = {};
  for (const [rel, recorded] of Object.entries(records)) {
    if (expected.has(rel) || !isInstallRootPath(rel)) continue;
    const cap = capabilityOf(rel);
    if (cap !== null && (frozen.has(cap) || !owned.has(cap))) continue;

    const disk = readDiskState(projectRoot, rel);
    if (disk.kind === 'absent') continue;
    carried[rel] = recorded;
    if (disk.kind === 'unreadable') {
      orphans.push({ path: rel, state: 'unreadable', reason: disk.reason });
    } else {
      orphans.push({
        path: rel,
        state: disk.hash === recorded ? 'unchanged' : 'edited',
      });
    }
  }
  // Code-unit order, never locale order.
  orphans.sort((a, b) => Number(a.path > b.path) - Number(a.path < b.path));
  return { orphans, records: carried };
}

const GROUPS: readonly { state: OrphanState; heading: string }[] = [
  { state: 'unchanged', heading: 'UNCHANGED — unchanged since pharn wrote it' },
  {
    state: 'edited',
    heading: 'EDITED — changed since pharn wrote it — review before deleting',
  },
  {
    state: 'unreadable',
    heading: 'UNREADABLE — not a readable regular file; inspect by hand',
  },
];

/**
 * The body of the ORPHANED note `update` and `status` print, or null. Paths
 * come from the hand-editable store, so each goes through `terminalSafe`.
 */
export function orphanNoteLines(orphans: readonly Orphan[]): string[] | null {
  if (orphans.length === 0) return null;
  const lines: string[] = [
    '  Upstream no longer ships these files pharn installed. pharn never deletes',
    '  them, and keeps listing each one until it is gone.',
    '',
  ];
  let capped = false;
  for (const { state, heading } of GROUPS) {
    const group = orphans.filter((o) => o.state === state);
    if (group.length === 0) continue;
    lines.push(`  ${heading}`);
    for (const o of group.slice(0, MAX_ORPHANS_PER_GROUP)) {
      const path = terminalSafe(o.path);
      lines.push(
        o.reason !== undefined
          ? `  ${path} — ${terminalSafe(o.reason)}`
          : `  ${path}`,
      );
    }
    if (group.length > MAX_ORPHANS_PER_GROUP) {
      capped = true;
      lines.push(`  … and ${group.length - MAX_ORPHANS_PER_GROUP} more`);
    }
    lines.push('');
  }
  lines.push(
    pc.dim(
      '  Delete the ones you no longer need by hand (e.g. `git rm <path>`).',
    ),
  );
  if (capped) {
    lines.push(pc.dim('  The full list: `pharn status --json` (`orphans`).'));
  }
  return lines;
}
