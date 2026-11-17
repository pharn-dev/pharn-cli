import { existsSync } from 'node:fs';
import { BACKUP_DIR, replacedConfigBackup } from './backup.js';
import {
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from './install-manifest.js';
import { safeJoin } from './validate.js';
import { manifestSources, scanDest, type DriftLabel } from './dest-drift.js';
import type { FileRecords } from './install-records.js';
import type { CapabilityRemoval } from './capability-removal.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Which of `init`'s write targets already exist, which of those the install
// would back up, and in what order to list them. ONE read-only computation for
// the overwrite prompt, the `--dry-run` preview and the `--yes` refusal, so the
// preview's marks are the prompt's by construction. Labels are `scanDest`'s
// (update's own table).
// ---------------------------------------------------------------------------

// Cap the listed paths so a full re-install stays readable.
export const MAX_LISTED = 10;

// How each backed-up file is marked, and the group order (most actionable first).
export const DRIFT_MARKERS: Readonly<Record<DriftLabel, string>> = {
  modified: '(edited)',
  unrecorded: '(no pharn record)',
  unverifiable: '(differs from upstream)',
};
export const DRIFT_LABEL_ORDER: readonly DriftLabel[] = [
  'modified',
  'unrecorded',
  'unverifiable',
];
// The existing pharn.config.json: not drift, but rewritten (`models` reset)
// and always backed up first.
export const CONFIG_MARKER = '(will be rewritten — backed up first)';

export interface WriteTargetsPlan {
  /**
   * Every existing write target: labelled ones first (by label, then path),
   * then an existing pharn.config.json that will be backed up, then the rest.
   */
  conflicts: string[];
  /** Why each labelled target would be backed up; unlabelled → not backed up. */
  labels: ReadonlyMap<string, DriftLabel>;
  /** An existing regular-file pharn.config.json: ALWAYS backed up first. */
  configBackedUp: boolean;
  /**
   * The capability directories this re-install deletes, passed through so the
   * prompt and the dry run list the same set. Empty for a first install.
   */
  removals: readonly CapabilityRemoval[];
}

export interface WriteTargetsParams {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  // The install manifest for exactly these capabilities, dest → source.
  manifest: ReadonlyMap<string, string>;
  // The replaced install's records baseline, or null (then every differing
  // file is `unverifiable`).
  records: FileRecords | null;
  // The removal plan of the dropped capabilities; absent → none.
  removals?: readonly CapabilityRemoval[];
  // The drift labels a caller's own `scanDest` over the manifest already
  // produced (init's plan scans every manifest path once); absent → the
  // existing targets are scanned here.
  labels?: ReadonlyMap<string, DriftLabel>;
}

export function planWriteTargets(params: WriteTargetsParams): WriteTargetsPlan {
  const { repoDir, projectRoot, capabilities, manifest, records } = params;
  const removals = params.removals ?? [];
  const conflicts = conflictingWriteTargets({
    repoDir,
    projectRoot,
    capabilities,
    expected: manifest,
  });
  if (conflicts.length === 0)
    return { conflicts, labels: new Map(), configBackedUp: false, removals };

  // Which of those would be backed up — the files `update` would have SKIPPED.
  // `pharn.config.json` is outside the manifest, so it is marked on its own.
  // A label exists only for an existing regular file, so the caller's labels
  // over the whole manifest are exactly these targets' labels.
  const labels =
    params.labels ??
    scanDest({
      repoDir,
      projectRoot,
      rels: conflicts.filter((p) => manifest.has(p)),
      sources: manifestSources(repoDir, manifest),
      records,
    }).labels;
  // Ranked right after the labelled files, so a capped list cannot hide it.
  const configBackedUp =
    conflicts.includes(PHARN_CONFIG_FILE) &&
    replacedConfigBackup(projectRoot).length > 0;
  const rank = (p: string): number => {
    const label = labels.get(p);
    if (label !== undefined) return DRIFT_LABEL_ORDER.indexOf(label);
    return configBackedUp && p === PHARN_CONFIG_FILE
      ? DRIFT_LABEL_ORDER.length
      : DRIFT_LABEL_ORDER.length + 1;
  };
  return {
    conflicts: [...conflicts].sort((a, b) => rank(a) - rank(b)),
    labels,
    configBackedUp,
    removals,
  };
}

/**
 * The display lines for the existing directories a re-install would DELETE,
 * each with how many of its files would be backed up first.
 */
export function removalLines(removals: readonly CapabilityRemoval[]): string[] {
  return removals
    .filter((r) => r.present)
    .map((r) => {
      const n = r.backups.length;
      return n === 0
        ? `  • ${r.dir}/ (${r.cap.role}:${r.cap.name})`
        : `  • ${r.dir}/ (${r.cap.role}:${r.cap.name} — ${n} file(s) backed up to ${BACKUP_DIR}/ first)`;
    });
}

/**
 * The display lines for a plan's existing targets, each marked when it would be
 * backed up, capped at `max` (with an "…and N more" line) when given.
 */
export function targetLines(
  plan: Pick<WriteTargetsPlan, 'conflicts' | 'labels' | 'configBackedUp'>,
  max?: number,
): string[] {
  const { conflicts: paths, labels, configBackedUp } = plan;
  const shown = max === undefined ? paths : paths.slice(0, max);
  const lines = shown.map((p) => {
    const label = labels.get(p);
    if (label !== undefined) return `  • ${p} ${DRIFT_MARKERS[label]}`;
    return configBackedUp && p === PHARN_CONFIG_FILE
      ? `  • ${p} ${CONFIG_MARKER}`
      : `  • ${p}`;
  });
  const more = paths.length - shown.length;
  if (more > 0) lines.push(`  …and ${more} more`);
  return lines;
}

/**
 * `init --yes` met an existing write target: a named refusal (exit 1, nothing
 * written), reported like a held lock.
 */
export class OverwriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverwriteRefusedError';
  }
}

// How every `init --yes` refusal ends — one wording for both refusals.
const YES_WAYS_FORWARD = [
  '--yes never overwrites. Run `pharn init` in a terminal to review and confirm the overwrite,',
  '`pharn init --dry-run` to see the whole plan, or `pharn update` to refresh an existing install.',
];

/**
 * The early `--yes` refusal, BEFORE the fetch: an existing `pharn.config.json`
 * is always a write target (the same `existsSync` test), so
 * `assertNoExistingTargets` would refuse anyway. Names only that file — the
 * other targets need the clone. Null when the file does not exist.
 */
export function existingConfigRefusal(projectRoot: string): string | null {
  if (!existsSync(safeJoin(projectRoot, PHARN_CONFIG_FILE))) return null;
  return [
    `pharn init --yes installs only into a project where none of its files exists yet, and ${PHARN_CONFIG_FILE} already exists.`,
    ...YES_WAYS_FORWARD,
  ].join('\n');
}

/**
 * The `--yes` gate: throw OverwriteRefusedError unless NONE of the install's
 * write targets exists — `--yes` never answers the overwrite question. Takes
 * no removals: they come only from a replaced `pharn.config.json`, which is
 * itself a conflict, so `--yes` never deletes.
 */
export function assertNoExistingTargets(
  params: Omit<WriteTargetsParams, 'removals'>,
): void {
  refuseExistingTargets(planWriteTargets(params));
}

/**
 * The same gate over targets the caller already planned (init's one plan):
 * throws OverwriteRefusedError unless none exists.
 */
export function refuseExistingTargets(
  plan: Pick<WriteTargetsPlan, 'conflicts' | 'labels' | 'configBackedUp'>,
): void {
  if (plan.conflicts.length === 0) return;
  const n = plan.conflicts.length;
  throw new OverwriteRefusedError(
    [
      `pharn init --yes installs only into a project where none of its files exists yet, and ${n} of them already exist:`,
      ...targetLines(plan, MAX_LISTED),
      ...YES_WAYS_FORWARD,
    ].join('\n'),
  );
}
