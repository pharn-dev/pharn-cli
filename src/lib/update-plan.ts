import { parseCapabilityIndex } from './capability-index.js';
import { unknownCapabilitiesWarning } from './unknown-capabilities.js';
import { resolveCapabilities } from './resolve-capabilities.js';
import {
  mergeCapabilities,
  type CapabilityChange,
  type CapabilityChangeReason,
} from './merge-capabilities.js';
import {
  CapabilityRemovalError,
  planCapabilityRemovals,
  type CapabilityRemoval,
  type DropReason,
} from './capability-removal.js';
import {
  absentInstallSurfaces,
  collectExpectedInstallPaths,
  type AbsentSurface,
} from './install-manifest.js';
import { readDiskState } from './apply-update.js';
import { contentHash } from './hash.js';
import {
  capabilitySubtree,
  configLayout,
  detectLayout,
  layoutPaths,
  resolveFeaturesReadme,
  type LayoutPaths,
} from './layout.js';
import {
  carriedSettingsRecord,
  MODELS_RECORD_KEY,
  readRecords,
  recordsBaseline,
  recordsUnderCapabilities,
  type FileRecords,
} from './install-records.js';
import { decideModelsUpdate, type ModelsUpdate } from './models-update.js';
import { readUpstreamModels } from './upstream-models.js';
import { findOrphans, type Orphan } from './orphans.js';
import { planGitignore, type GitignorePlan } from './gitignore.js';
import {
  planPrettierignore,
  type PrettierignorePlan,
} from './prettierignore.js';
import { planRootMigration, type RootMigration } from './root-migration.js';
import {
  planUpdate,
  type DiskState,
  type PlannedFile,
  type SkipLabel,
  type UnitHold,
  type UpdatePlan,
} from './update-decision.js';
import { isExecutableUnitPath } from './executable-unit.js';
import {
  changesNothing,
  planStateChanges,
  type StateChanges,
} from './update-next.js';
import { diffHookWiring, type HookWiringDiff } from './hook-wiring.js';
import { readSkillsVersion } from './skills-version.js';
import { CONFIG_FILENAME } from './pharn-config.js';
import { FEATURES_README } from './constants.js';
import type { RefChoice } from './release.js';
import type {
  InstalledCapability,
  Layout,
  PharnConfig,
  UnknownCapability,
} from '../types.js';

// The planning half of `pharn update`, shared by the real run and `--dry-run`.
// It READS the clone and the project and writes nothing (not even a log).
// `report` is what a preview shows — JSON-safe by construction (no
// Map/Set/function/Date); `apply` is what only the writer needs, never printed.

// The skips that are the user's own kept edits — the only ones that may leave a
// `pendingSkillsVersion` behind.
export const USER_EDIT_SKIPS = new Set<SkipLabel>(['modified', 'unrecorded']);

// The merge outcomes that take an entry OUT of the config; any other reason
// never deletes anything.
const DROP_REASONS = new Set<CapabilityChangeReason>([
  'dropped-unselected',
  'dropped-gone',
]);

function isDrop(reason: CapabilityChangeReason): reason is DropReason {
  return DROP_REASONS.has(reason);
}

// The removal plan is shared with a re-run `init` (lib/capability-removal.ts).
export { CapabilityRemovalError, type CapabilityRemoval };

export interface UpdatePlanReport {
  // The version recorded before this run, and the one upstream ships.
  currentVersion: string;
  installedVersion: string;
  // The version that would be recorded — `installedVersion` for a complete run,
  // `currentVersion` when skips withhold the bump.
  recordedVersion: string;
  versionWithheld: boolean;
  pendingSkillsVersion: string | null;
  // `role:name` of every capability the run keeps without re-copying.
  frozenCapabilities: string[];
  capCount: number;
  layout: Layout;
  abandonedLayout: Layout | null;
  featuresReadmeRelocation: boolean;
  capabilityChanges: CapabilityChange[];
  // The directories this run deletes — one per capability it drops.
  removals: CapabilityRemoval[];
  files: PlannedFile[];
  writes: string[];
  // Rels that would be copied to `pharn/.backup/` first; includes
  // `pharn.config.json` when the models block is forced.
  backups: string[];
  skipped: UpdatePlan['skipped'];
  counts: UpdatePlan['counts'];
  // The executable-unit hold (lib/executable-unit.ts): the unit files that were
  // skipped and the unit writes withheld because of them; null when none.
  executableUnit: UnitHold | null;
  models: ModelsUpdate;
  modelsFloor: string;
  hookWiring: HookWiringDiff;
  // The declared product surfaces the clone ships no file for, at its own
  // layout (absentInstallSurfaces). Reported, never a skip: it withholds
  // nothing, since no file on disk was left behind by it.
  absentUpstream: AbsentSurface[];
  recordsNote: string | null;
  unknownWarning: string | null;
  // The structured twin of `unknownWarning`: what the fetch boundary refused.
  unknownCapabilities: UnknownCapability[];
  // Recorded files upstream no longer ships that are still on disk
  // (lib/orphans.ts). Never written or deleted; a root doc the migration
  // deletes is not listed.
  orphans: Orphan[];
  // The old root footprint this run retires (lib/root-migration.ts), or null.
  rootMigration: RootMigration | null;
  // What this run adds to `.gitignore` (lib/gitignore.ts); re-planned under
  // the lock by the writer.
  gitignore: GitignorePlan;
  // What this run adds to `.prettierignore` (lib/prettierignore.ts); re-planned
  // under the lock over `apply.prettierignorePaths`.
  prettierignore: PrettierignorePlan;
  // Whether the run would change pharn.config.json (beyond `updatedAt` /
  // `pharnVersion`) or pharn.records.json. Internal: never in the JSON report.
  stateChanges: StateChanges;
  // THE "changes nothing" predicate (lib/update-next.ts): the real run then
  // asks nothing and writes nothing; the dry run and `--json` read it too.
  changesNothing: boolean;
}

export interface UpdateApplyInputs {
  // rel → absolute source path in the clone (the install manifest).
  expected: Map<string, string>;
  // The validated baseline, or null when records are unavailable.
  records: FileRecords | null;
  plan: UpdatePlan;
  models: ModelsUpdate;
  // The membership recorded in the config (frozen entries kept).
  configCapabilities: InstalledCapability[];
  frozen: Set<string>;
  frozenRecords: FileRecords;
  // The orphans' previous records, carried so they stay listed on later runs.
  orphanRecords: FileRecords;
  // The record of the `.claude/settings.json` a fresh init wrote, carried
  // while the file is there. `update` never writes that file.
  settingsRecords: FileRecords;
  nextSkillsVersion: string;
  nextCommit: string | null;
  frozenKeys: string[];
  // The paths the removals are addressed at (the config's recorded layout).
  removalPaths: LayoutPaths;
  // The paths `.prettierignore` must cover (report.prettierignore's input).
  prettierignorePaths: string[];
}

export interface PlannedUpdate {
  report: UpdatePlanReport;
  apply: UpdateApplyInputs;
}

export function buildUpdatePlan(input: {
  repoDir: string;
  sha: string | null;
  config: PharnConfig;
  cwd: string;
  force: boolean;
  channel: RefChoice;
  // Called with the unknown-capabilities warning the moment the index is
  // parsed, so it prints before any later throw.
  onUnknownWarning?: (warning: string) => void;
}): PlannedUpdate {
  const { repoDir, sha, config, cwd, force, channel, onUnknownWarning } = input;

  const index = parseCapabilityIndex(repoDir);
  // A capability the fetch boundary refused is NAMED.
  const unknownWarning = unknownCapabilitiesWarning(index.unknown);
  if (unknownWarning) onUnknownWarning?.(unknownWarning);
  // `role:name` of every unparseable capability, from the SUBTREE's role (the
  // declared role may be what failed).
  const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
  const selection = resolveCapabilities(config.archetypes ?? [], index);
  // The UNION of the re-resolved auto set and every manual entry
  // (lib/merge-capabilities.ts). Membership is planned even when the version
  // is withheld: the archetypes decide membership, and a newly-selected
  // capability's files are absent, so they always take the `restored` row.
  const merged = mergeCapabilities(
    selection,
    config.capabilities ?? [],
    frozen,
  );
  // TWO arrays: the CONFIG keeps a frozen entry, the MANIFEST must not — it is
  // `update`'s only write source, and enumerating an unparseable clone dir
  // would copy an arbitrary upstream directory into the project.
  const configCapabilities: InstalledCapability[] = merged.capabilities;
  const manifestCapabilities = configCapabilities.filter(
    (cap) => !frozen.has(`${cap.role}:${cap.name}`),
  );
  const installedVersion = readSkillsVersion(repoDir);

  // The layout the copy mirrors is the CLONE's, so it is also what is RECORDED.
  const layout = detectLayout(repoDir);
  const previousLayout = configLayout(config);

  const expected = collectExpectedInstallPaths({
    repoDir,
    capabilities: manifestCapabilities,
    layout,
  });

  const latestHashes = new Map<string, string>();
  for (const [rel, source] of expected)
    latestHashes.set(rel, contentHash(source));

  const diskStates = new Map<string, DiskState>();
  for (const rel of expected.keys())
    diskStates.set(rel, readDiskState(cwd, rel));

  // Read ONCE: the baseline, and the store the "changes nothing" comparison
  // holds the next one against.
  const loadedRecords = readRecords(cwd);
  const { records, note: recordsNote } = recordsBaseline(loadedRecords);

  // The unit is held only when this run moves the version (at the same version
  // a write puts back same-version bytes). Judged at the CLONE's layout.
  const unitPaths = layoutPaths(layout);
  const plan = planUpdate({
    latestHashes,
    diskStates,
    records,
    force,
    unit: (rel) => isExecutableUnitPath(rel, unitPaths),
    holdUnit: installedVersion !== config.skillsVersion,
  });

  // What the drops delete, against the same baseline. In the real run this
  // runs under the lock right before the writes, so it is authoritative.
  const removalPaths = layoutPaths(previousLayout);
  const removals = planCapabilityRemovals({
    cwd,
    paths: removalPaths,
    drops: merged.changes.flatMap(({ cap, reason }) =>
      isDrop(reason) ? [{ cap, reason }] : [],
    ),
    records,
    command: 'update',
  });

  // The `models` block goes through the same rows, over its hash instead of a
  // file's (lib/models-update.ts).
  const models = decideModelsUpdate({
    current: config.models,
    upstream: readUpstreamModels(repoDir),
    recorded: records?.[MODELS_RECORD_KEY] ?? null,
    recordsAvailable: records !== null,
    force,
  });

  // A `--force` over the user's models block backs up the whole config: the
  // block lives inside it.
  const backups = models.backup
    ? [...plan.backups, CONFIG_FILENAME]
    : plan.backups;

  // A run that could not apply everything must not claim the new version. A
  // KEPT models block does not count: it is configuration, not bytes.
  const versionWithheld = plan.counts.skipped > 0;
  const nextSkillsVersion = versionWithheld
    ? config.skillsVersion
    : installedVersion;
  const nextCommit = versionWithheld ? config.commit : sha;
  // Withheld ONLY by the user's kept edits (directly, or through a unit hold
  // they caused) → everything outside those edits and the unit IS at
  // `installedVersion`, so record it as pending for `add`, which writes
  // capability dirs only. `held` is accepted only because every blocker's own
  // label is also a `plan.skipped` group, so an `unverifiable` / `unreadable`
  // blocker fails this test.
  const pendingSkillsVersion =
    versionWithheld &&
    installedVersion !== nextSkillsVersion &&
    plan.skipped.every(
      (g) => USER_EDIT_SKIPS.has(g.label) || g.label === 'held',
    )
      ? installedVersion
      : null;

  // A frozen capability is absent from the manifest, which keys `nextRecords`,
  // so its untouched records are carried here instead of pruned.
  const paths = layoutPaths(layout);
  const frozenRecords =
    records === null
      ? {}
      : recordsUnderCapabilities(
          records,
          paths,
          configCapabilities.filter((cap) =>
            frozen.has(`${cap.role}:${cap.name}`),
          ),
        );

  // Orphans: recorded files outside the manifest still on disk. Disjoint from
  // the manifest, so they never reach the decision table; their records are
  // carried. A capability this run DROPS is excluded.
  const orphanScan = findOrphans({
    projectRoot: cwd,
    records,
    expected,
    capabilities: configCapabilities,
    frozen: configCapabilities.filter((cap) =>
      frozen.has(`${cap.role}:${cap.name}`),
    ),
  });

  // The old root footprint, against the same baseline. A root doc it deletes
  // leaves the orphan list (retired, not left behind); one it KEEPS stays an
  // orphan. Held while the unit is held: it deletes paths the OLD floor still
  // reads (pendingRootMigration re-opens the run later).
  const rootMigration =
    plan.held !== null
      ? null
      : planRootMigration({
          projectRoot: cwd,
          repoDir,
          layout,
          installedLayout: previousLayout,
          skillsVersion: installedVersion,
          records,
        });
  const retired = new Set(
    (rootMigration?.docs ?? [])
      .filter((d) => d.action === 'delete')
      .map((d) => d.rel),
  );
  const orphans = orphanScan.orphans.filter((o) => !retired.has(o.path));
  // The paths `.prettierignore` must cover: everything this run may record. A
  // superset of the store it writes (a retired root doc's delete may fail), so
  // the same-version re-open, which reads the store, stays bounded.
  const prettierignorePaths = [
    ...expected.keys(),
    ...Object.keys(frozenRecords),
    ...Object.keys(orphanScan.records),
  ];

  // Only KEPT entries count, so an unparseable capability this project never
  // had cannot pin every run to a re-fetch. One that parses again stays listed
  // while any of its files was skipped this run.
  const previouslyFrozen = new Set(config.frozenCapabilities ?? []);
  const skippedRels = plan.skipped.flatMap((group) => group.rels);
  const hasSkippedFile = (cap: InstalledCapability): boolean => {
    // The same `<subtree>/<name>/` prefix recordsUnderCapabilities keys on.
    const subtree = capabilitySubtree(paths, cap.role);
    const prefix = `${subtree}/${cap.name}/`;
    return skippedRels.some((rel) => rel.startsWith(prefix));
  };
  const frozenKeys = [
    ...new Set(
      configCapabilities
        .filter((cap) => {
          const key = `${cap.role}:${cap.name}`;
          return (
            frozen.has(key) ||
            (previouslyFrozen.has(key) && hasSkippedFile(cap))
          );
        })
        .map((cap) => `${cap.role}:${cap.name}`),
    ),
  ].sort();

  const report: Omit<UpdatePlanReport, 'stateChanges' | 'changesNothing'> = {
    currentVersion: config.skillsVersion,
    installedVersion,
    recordedVersion: nextSkillsVersion,
    versionWithheld,
    pendingSkillsVersion,
    frozenCapabilities: frozenKeys,
    capCount: configCapabilities.length,
    layout,
    // `applyWrites` returns exactly `plan.writes` on success, so the count is
    // known before anything is written.
    abandonedLayout:
      previousLayout !== layout && plan.writes.length > 0
        ? previousLayout
        : null,
    featuresReadmeRelocation:
      records !== null &&
      FEATURES_README in records &&
      resolveFeaturesReadme(repoDir, layout) !== FEATURES_README,
    capabilityChanges: merged.changes,
    removals,
    files: plan.files,
    writes: plan.writes,
    backups,
    skipped: plan.skipped,
    counts: plan.counts,
    executableUnit: plan.held,
    models,
    modelsFloor: paths.floor,
    // Read-only; `update` never writes the settings files it reads.
    hookWiring: diffHookWiring(repoDir, cwd),
    absentUpstream: absentInstallSurfaces({ repoDir, layout }),
    recordsNote,
    unknownWarning,
    unknownCapabilities: index.unknown,
    orphans,
    rootMigration,
    gitignore: planGitignore(cwd),
    prettierignore: planPrettierignore(cwd, prettierignorePaths),
  };
  const apply: UpdateApplyInputs = {
    expected,
    records,
    plan,
    models,
    configCapabilities,
    frozen,
    frozenRecords,
    orphanRecords: orphanScan.records,
    // Not an install path, so neither an orphan nor a `.prettierignore` input.
    settingsRecords: carriedSettingsRecord(cwd, records),
    nextSkillsVersion,
    nextCommit,
    frozenKeys,
    removalPaths,
    prettierignorePaths,
  };
  const stateChanges = planStateChanges({
    config,
    report,
    apply,
    channel,
    loadedRecords,
  });
  return {
    report: {
      ...report,
      stateChanges,
      changesNothing: changesNothing(report, stateChanges),
    },
    apply,
  };
}
