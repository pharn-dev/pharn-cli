import { parseCapabilityIndex } from './capability-index.js';
import { unknownCapabilitiesWarning } from './unknown-capabilities.js';
import { resolveCapabilities } from './resolve-capabilities.js';
import { existsSync } from 'node:fs';
import {
  mergeCapabilities,
  type CapabilityChange,
  type CapabilityChangeReason,
} from './merge-capabilities.js';
import {
  capabilityDir,
  capabilityRelDir,
  linkedComponent,
} from './capability-dir.js';
import { removalBackupSet } from './removal-backup.js';
import { errorMessage } from './report-error.js';
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
  MODELS_RECORD_KEY,
  readRecords,
  recordsBaseline,
  recordsUnderCapabilities,
  type FileRecords,
} from './install-records.js';
import { decideModelsUpdate, type ModelsUpdate } from './models-update.js';
import { readUpstreamModels } from './upstream-models.js';
import { findOrphans, type Orphan } from './orphans.js';
import {
  planUpdate,
  type DiskState,
  type PlannedFile,
  type UpdateLabel,
  type UpdatePlan,
} from './update-decision.js';
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
// It READS the clone and the project and writes nothing: no log, no backup, no
// copy, no records, no config. Everything the real run needs to write is in
// `apply`; everything a preview needs to SHOW is in `report`.
//
// `report` is JSON-safe by construction (plain objects, arrays and strings — no
// Map/Set/function/Date), so a later `--json` output can serialize it as is.
// `apply` is not, and is never printed.

// The skips that are the user's own kept edits — the only ones that may leave a
// `pendingSkillsVersion` behind.
export const USER_EDIT_SKIPS = new Set<UpdateLabel | 'unreadable'>([
  'modified',
  'unrecorded',
]);

// The two merge outcomes that take an entry OUT of the config (rows 5, 7, 9 of
// lib/merge-capabilities.ts). Membership on the reason enum (P5): a reason not
// in this set never deletes anything.
const DROP_REASONS = new Set<CapabilityChangeReason>([
  'dropped-unselected',
  'dropped-gone',
]);

/**
 * A capability this run drops from the config, and so deletes from disk: PHARN's
 * commands find capabilities by scanning their directories, not by reading
 * `pharn.config.json`, so a dropped entry whose directory stayed would keep
 * running — and, with no config entry, `pharn remove` could no longer reach it.
 */
export interface CapabilityRemoval {
  cap: InstalledCapability;
  reason: 'dropped-unselected' | 'dropped-gone';
  // `<subtree>/<name>` at the layout the CONFIG recorded — where it was
  // installed, where `remove` addresses it, and how its records are keyed.
  dir: string;
  // Whether there is anything at that address to delete.
  present: boolean;
  // Project-relative files copied to `.pharn-backup/` before the delete: every
  // regular file in it that is not provably pharn's own unchanged bytes
  // (lib/removal-backup.ts). Sorted.
  backups: string[];
}

/**
 * The run must not delete a dropped capability's directory: a symlinked
 * component on the way to it, or a file in it that cannot be checked. Thrown by
 * the PLANNER, so it fires before anything is written; the message is complete
 * and user-facing (a refusal, not a crash).
 */
export class CapabilityRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityRemovalError';
  }
}

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
  // Rels that would be copied to `.pharn-backup/` first; includes
  // `pharn.config.json` when the models block is forced.
  backups: string[];
  skipped: UpdatePlan['skipped'];
  counts: UpdatePlan['counts'];
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
  // (lib/orphans.ts). Reported only; never written, never deleted.
  orphans: Orphan[];
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
  nextSkillsVersion: string;
  nextCommit: string | null;
  frozenKeys: string[];
  // The paths the removals are addressed at (the config's recorded layout).
  removalPaths: LayoutPaths;
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
  // Called with the unknown-capabilities warning the moment the index is parsed,
  // so a caller that logs it keeps the order it always had (before any later
  // throw). `report.unknownWarning` carries the same string.
  onUnknownWarning?: (warning: string) => void;
}): PlannedUpdate {
  const { repoDir, sha, config, cwd, force, onUnknownWarning } = input;

  const index = parseCapabilityIndex(repoDir);
  // No silent skips (P5): a capability the fetch boundary refused is NAMED.
  const unknownWarning = unknownCapabilitiesWarning(index.unknown);
  if (unknownWarning) onUnknownWarning?.(unknownWarning);
  // `role:name` for every unparseable capability, built from the SUBTREE's role
  // (authoritative — a frozen capability's declared role may be what failed). It
  // answers what index membership cannot: "removed upstream, or unreadable now?"
  const frozen = new Set(index.unknown.map((u) => `${u.role}:${u.name}`));
  const selection = resolveCapabilities(config.archetypes ?? [], index);
  // The UNION, not a wholesale replace: the freshly-resolved auto set PLUS every
  // manual entry (lib/merge-capabilities.ts owns the table).
  //
  // Membership is planned even when the version is withheld (below), and that is
  // deliberate: membership answers "which capabilities does this project have",
  // which the archetypes decide, while the version answers "are its BYTES
  // complete". A newly-selected capability's files are absent, so they always
  // take the `restored` row and are written regardless.
  const merged = mergeCapabilities(
    selection,
    config.capabilities ?? [],
    frozen,
  );
  // TWO arrays, deliberately. The CONFIG keeps a frozen entry (it is still this
  // project's capability); the MANIFEST must not: it is `update`'s only write
  // source, and enumerating an unparseable clone directory would classify its
  // files `restored` and copy an arbitrary upstream directory into the project.
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

  const { records, note: recordsNote } = recordsBaseline(readRecords(cwd), {
    skillsVersion: config.skillsVersion,
    commit: config.commit,
  });

  const plan = planUpdate({ latestHashes, diskStates, records, force });

  // What the drops delete, judged against the same record baseline. In the
  // real run this runs under the project lock immediately before the writes, so
  // it is the authoritative answer, not a preview of one.
  const removalPaths = layoutPaths(previousLayout);
  const removals = planRemovals(cwd, removalPaths, merged.changes, records);

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

  // A run that could not apply everything must not claim the new version: the
  // recorded version describes the last COMPLETE state. A KEPT models block is
  // not such a skip: it is configuration, not bytes of a version.
  const versionWithheld = plan.counts.skipped > 0;
  const nextSkillsVersion = versionWithheld
    ? config.skillsVersion
    : installedVersion;
  const nextCommit = versionWithheld ? config.commit : sha;
  // Withheld ONLY by the user's own kept edits → every other file IS at
  // `installedVersion`, so record that as pending and let `add` install at it.
  // Exact label membership, not "forceable" (P5). A pending version equal to the
  // withheld one tells `add` nothing it does not already accept.
  const pendingSkillsVersion =
    versionWithheld &&
    installedVersion !== nextSkillsVersion &&
    plan.skipped.every((g) => USER_EDIT_SKIPS.has(g.label))
      ? installedVersion
      : null;

  // A frozen capability is absent from the manifest, and `planUpdate` keys
  // `nextRecords` by the manifest — so without this its entries would be pruned.
  // Nothing under it was touched, so its recorded hashes are still true.
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

  // Orphans: recorded files outside the manifest that are still on disk. Their
  // keys are disjoint from the manifest, so they never reach the decision table
  // and never withhold the version; their records are carried (lib/orphans.ts).
  // A capability this run DROPS is excluded — its dir is not "still installed".
  const orphanScan = findOrphans({
    projectRoot: cwd,
    records,
    expected,
    capabilities: configCapabilities,
    frozen: configCapabilities.filter((cap) =>
      frozen.has(`${cap.role}:${cap.name}`),
    ),
  });

  // Only KEPT entries count: an unparseable capability this project never had
  // must not pin every future run to a re-fetch. And one the LAST run listed
  // that parses again stays listed while any of ITS files was skipped this run.
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

  return {
    report: {
      currentVersion: config.skillsVersion,
      installedVersion,
      recordedVersion: nextSkillsVersion,
      versionWithheld,
      pendingSkillsVersion,
      frozenCapabilities: frozenKeys,
      capCount: configCapabilities.length,
      layout,
      // `applyWrites` returns exactly `plan.writes` on success, so the number of
      // files written is known before anything is written.
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
      models,
      modelsFloor: paths.floor,
      // Read-only, never throws, and `update` never writes the settings files it
      // reads, so the answer is the same before and after the writes.
      hookWiring: diffHookWiring(repoDir, cwd),
      absentUpstream: absentInstallSurfaces({ repoDir, layout }),
      recordsNote,
      unknownWarning,
      unknownCapabilities: index.unknown,
      orphans: orphanScan.orphans,
    },
    apply: {
      expected,
      records,
      plan,
      models,
      configCapabilities,
      frozen,
      frozenRecords,
      orphanRecords: orphanScan.records,
      nextSkillsVersion,
      nextCommit,
      frozenKeys,
      removalPaths,
    },
  };
}

/**
 * One removal per capability the merge DROPPED (first per `role:name` — a
 * duplicated config entry is one directory). Reads only.
 *
 * Refuses (CapabilityRemovalError) rather than plan a delete it cannot make
 * safely: a symlinked component on the way (`rmSync` would follow it out of the
 * project), or a file it cannot read (an unreadable file must never be treated
 * as "pharn's own, safe to delete" — fail closed). A path below a regular file
 * cannot hold a directory, so it is simply not present.
 */
function planRemovals(
  cwd: string,
  paths: LayoutPaths,
  changes: readonly CapabilityChange[],
  records: FileRecords | null,
): CapabilityRemoval[] {
  const removals: CapabilityRemoval[] = [];
  const seen = new Set<string>();
  for (const change of changes) {
    if (!DROP_REASONS.has(change.reason)) continue;
    const { cap } = change;
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
        `Refusing to update: ${label} is no longer installed, so its directory ${dir} would be deleted — but ${linked} is a symbolic link, and deleting through it would delete files OUTSIDE the project. Nothing was changed. Delete ${dir} yourself, then run \`pharn update\` again.`,
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
    removals.push({
      cap,
      reason: change.reason as CapabilityRemoval['reason'],
      dir,
      present,
      backups,
    });
  }
  return removals;
}
