import { replacedConfigBackup } from './backup.js';
import {
  conflictingWriteTargets,
  PHARN_CONFIG_FILE,
} from './install-manifest.js';
import { detectLayout } from './layout.js';
import { manifestSources, scanDest, type DriftLabel } from './dest-drift.js';
import type { FileRecords } from './install-records.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Which of `init`'s write targets already exist, which of those the install
// would back up, and in what order to list them. ONE computation, three
// readers: the overwrite prompt (steps/overwrite-check.ts), the `--dry-run`
// preview and the `--yes` refusal (commands/init.ts). So the marks a preview
// shows are, by construction, the marks the prompt would show.
//
// Read-only. The targets are `conflictingWriteTargets`' (the manifest plus
// `pharn.config.json`, existing only); the labels are `scanDest`'s, through
// `update`'s own table (lib/dest-drift.ts). Determinism (P5): a stable sort of
// an already-sorted list by a fixed label rank.
// ---------------------------------------------------------------------------

// Cap the listed paths so a full re-install (which conflicts on hundreds of
// files) stays readable; the count of the remainder is still surfaced.
export const MAX_LISTED = 10;

// How each backed-up file is marked in a list, and in what order the groups
// come — update's skip order, most actionable first (lib/update-decision.ts).
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
// The existing pharn.config.json: not drift, but rewritten (`seam` and
// `models` reset) — and always backed up first (lib/backup.ts →
// replacedConfigBackup).
export const CONFIG_MARKER = '(will be rewritten — backed up first)';

export interface WriteTargetsPlan {
  /**
   * Every existing write target: labelled ones first (by label, then path),
   * then an existing pharn.config.json that will be backed up, then the rest.
   */
  conflicts: string[];
  /** Why each labelled target would be backed up; unlabelled → not backed up. */
  labels: ReadonlyMap<string, DriftLabel>;
  /**
   * An existing regular-file pharn.config.json is among the targets: init
   * rewrites it, so it is ALWAYS backed up first — the same predicate the
   * install acts on (replacedConfigBackup).
   */
  configBackedUp: boolean;
}

export interface WriteTargetsParams {
  repoDir: string;
  projectRoot: string;
  capabilities: InstalledCapability[];
  // The install manifest for exactly these capabilities, dest → source.
  manifest: ReadonlyMap<string, string>;
  // The records baseline of the install being replaced, or null when there is
  // none to trust (then every differing file is `unverifiable`).
  records: FileRecords | null;
}

export function planWriteTargets(params: WriteTargetsParams): WriteTargetsPlan {
  const { repoDir, projectRoot, capabilities, manifest, records } = params;
  const conflicts = conflictingWriteTargets({
    repoDir,
    projectRoot,
    capabilities,
    layout: detectLayout(repoDir),
    expected: manifest,
  });
  if (conflicts.length === 0)
    return { conflicts, labels: new Map(), configBackedUp: false };

  // Which of those the install would back up — the files `update` would have
  // SKIPPED: changed since pharn wrote them, not recorded, or not verifiable.
  // `pharn.config.json` is outside the manifest (init regenerates it), so it is
  // never scanned — an existing one is marked on its own (configBackedUp).
  // Each file is compared with its real source (the mapped LICENSE included).
  const { labels } = scanDest({
    repoDir,
    projectRoot,
    rels: conflicts.filter((p) => manifest.has(p)),
    sources: manifestSources(repoDir, manifest),
    records,
  });
  // The existing config is rewritten and always backed up first — ranked right
  // after the labelled files, so a capped list cannot hide it.
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
  };
}

/**
 * The display lines for a plan's existing targets, each marked when it would be
 * backed up (its drift label, or the config's own mark), capped at `max` (with
 * an "…and N more" line) when a cap is given. Paths are project-relative and
 * already path-contained (lib/install-manifest.ts); they are displayed as data,
 * never executed.
 */
export function targetLines(plan: WriteTargetsPlan, max?: number): string[] {
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
 * `init --yes` met a project where at least one write target already exists.
 * A named refusal, not a crash: reported like a held lock, exit 1, nothing
 * written, no PHARN_DEBUG hint.
 */
export class OverwriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverwriteRefusedError';
  }
}

/**
 * The `--yes` gate: throw OverwriteRefusedError unless NONE of the install's
 * write targets exists. `--yes` never answers the overwrite question — it only
 * proceeds where there is no question to answer. A membership test over the
 * same set the prompt lists (P5); `commands/init.ts` runs it before the lock
 * and again under it, immediately before the install.
 */
export function assertNoExistingTargets(params: WriteTargetsParams): void {
  const plan = planWriteTargets(params);
  if (plan.conflicts.length === 0) return;
  const n = plan.conflicts.length;
  throw new OverwriteRefusedError(
    [
      `pharn init --yes installs only into a project where none of its files exists yet, and ${n} of them already exist:`,
      ...targetLines(plan, MAX_LISTED),
      '--yes never overwrites. Run `pharn init` in a terminal to review and confirm the overwrite,',
      '`pharn init --dry-run` to see the whole plan, or `pharn update` to refresh an existing install.',
    ].join('\n'),
  );
}
