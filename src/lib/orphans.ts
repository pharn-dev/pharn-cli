import pc from 'picocolors';
import { readDiskState } from './apply-update.js';
import { CLAUDE_COMMANDS_DIR, CLAUDE_HOOKS_DIR } from './constants.js';
import {
  isInstalledHookFile,
  isProductCommandFile,
} from './install-manifest.js';
import { layoutPaths, type LayoutPaths } from './layout.js';
import { MODELS_RECORD_KEY, type FileRecords } from './install-records.js';
import { terminalSafe } from './terminal-safe.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Orphaned files — the files pharn RECORDED writing that the install no longer
// owns: upstream stopped shipping them, but they are still on disk. `update`
// never deletes them (the only thing it deletes is the directory of a capability
// it DROPS — lib/update-plan.ts removals — and those keys are excluded here, so
// the two never overlap), so without this they would sit in `.claude/commands/` (still
// live slash commands), `.claude/hooks/` or the floor dir forever, and nothing
// would ever name them again once their records were pruned.
//
// Nothing here writes or deletes. `findOrphans` only reads, and returns the
// records of the orphans it found so `update` / a re-run `init` can CARRY them
// (the record still describes bytes pharn wrote) — that is what keeps an orphan
// listed on later runs. Its record is dropped once the file is gone.
//
// TRUST (P2): `pharn.records.json` is local and hand-editable, and this is one
// of the TWO places a record KEY becomes a filesystem path (the other is
// `pharn uninstall`, lib/uninstall-plan.ts, which deletes under the same
// isInstallRootPath bound and only at a matching hash). Here it does so only for
// a READ, and only when the key
//   1. passed the store's ingest rule (lib/install-records.ts — no `..`/`.`
//      segment, not absolute),
//   2. is a member of the install-root set below (a path some install, in
//      either layout, could have written — so a hand-added `src/auth.ts` key is
//      never read and never presented as a leftover to delete),
//   3. is `safeJoin`-contained, has no symlinked component and is a regular
//      file (readDiskState — the same physical read-side floor `update` and
//      `status` already use; a FIFO is never opened).
//
// DETERMINISM (P5): every branch is a Map/Set membership test, a fixed-prefix
// match or a hash equality; output is sorted by code unit.
//
// One axis (P3): which recorded files the install no longer owns.
// ---------------------------------------------------------------------------

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

const BOTH_LAYOUTS: readonly LayoutPaths[] = [
  layoutPaths('flat'),
  layoutPaths('pharn'),
];

// Whole-directory fixed surfaces (contracts, pharn-core, floor), both layouts.
const SURFACE_DIRS: readonly string[] = BOTH_LAYOUTS.flatMap((p) => [
  p.contracts,
  p.core,
  p.floor,
]);

// Single-file fixed surfaces (trusted docs, the mapped LICENSE, the
// product-loop boundary contract), both layouts.
const SURFACE_FILES: ReadonlySet<string> = new Set(
  BOTH_LAYOUTS.flatMap((p) => [...p.docs, p.license.to, p.featuresReadme]),
);

// Capability subtrees, both layouts, with the role each one holds.
const CAPABILITY_SUBTREES: readonly {
  subtree: string;
  role: InstalledCapability['role'];
}[] = BOTH_LAYOUTS.flatMap((p) => [
  { subtree: p.grillers, role: 'griller' as const },
  { subtree: p.lenses, role: 'lens' as const },
]);

// The direct child of `dir` that `rel` names, or null when `rel` is not
// exactly one segment below `dir`.
function directChild(rel: string, dir: string): string | null {
  if (!rel.startsWith(`${dir}/`)) return null;
  const name = rel.slice(dir.length + 1);
  return name !== '' && !name.includes('/') ? name : null;
}

// The `role:name` of the capability dir `rel` lies inside, or null when it is
// not inside one (`<subtree>/<name>/<at least one more segment>`).
function capabilityOf(rel: string): string | null {
  for (const { subtree, role } of CAPABILITY_SUBTREES) {
    if (!rel.startsWith(`${subtree}/`)) continue;
    const rest = rel.slice(subtree.length + 1);
    const slash = rest.indexOf('/');
    if (slash <= 0 || slash === rest.length - 1) return null;
    return `${role}:${rest.slice(0, slash)}`;
  }
  return null;
}

/**
 * Could ANY install (flat or pharn layout) have written `rel`? Mirrors the
 * surfaces lib/install-manifest.ts enumerates — capability dirs, contracts,
 * pharn-core, the floor, the trusted docs, the LICENSE dest, the features
 * README, product `pharn-*.md` commands and `.cjs`/`.mjs` hooks — derived from
 * `layoutPaths` so it follows the layout contract. A membership test (P5).
 */
export function isInstallRootPath(rel: string): boolean {
  if (rel === MODELS_RECORD_KEY) return false;
  if (SURFACE_FILES.has(rel)) return true;
  if (SURFACE_DIRS.some((dir) => rel.startsWith(`${dir}/`))) return true;
  if (capabilityOf(rel) !== null) return true;
  // The install's own name filters (lib/install-manifest.ts), so this bound
  // takes exactly the command and hook names an install copies — `.mjs` hooks
  // included — and cannot drift from them.
  const command = directChild(rel, CLAUDE_COMMANDS_DIR);
  if (command !== null) return isProductCommandFile(command);
  const hook = directChild(rel, CLAUDE_HOOKS_DIR);
  if (hook !== null) return isInstalledHookFile(hook);
  return false;
}

/**
 * The recorded files the install no longer owns that still exist on disk.
 *
 * A record key is an orphan when the store is usable (`records !== null`), the
 * key is not in `expected` (what this install writes now), it is an install
 * path (`isInstallRootPath`), it is not inside the dir of a `frozen`
 * capability (its records are carried by the caller) nor of a capability
 * outside `capabilities` (a DROPPED capability keeps today's prune), and
 * something is still there.
 *
 * `unchanged` = the bytes still hash to the record (pharn's own bytes);
 * `edited` = they do not; `unreadable` = something other than a readable
 * regular file sits there (named with the reason). Every orphan's record is
 * returned to be carried; a key whose file is gone is dropped.
 */
export function findOrphans(params: {
  projectRoot: string;
  records: FileRecords | null;
  expected: ReadonlyMap<string, unknown>;
  // The capabilities the install still owns files for (frozen ones included or
  // not — `frozen` wins).
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
  // Code-unit order, never locale order (P5).
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
 * The body of the ORPHANED note `update` and `status` print, or null when
 * there is nothing to report. Paths come from the hand-editable records store,
 * so each is passed through `terminalSafe` before display.
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
