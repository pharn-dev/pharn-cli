import { planGitignore, type GitignorePlan } from './gitignore.js';
import { findOrphans } from './orphans.js';
import {
  planPrettierignore,
  type PrettierignorePlan,
} from './prettierignore.js';
import { existsSync } from 'node:fs';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { readJsonBounded } from './bounded-read.js';
import {
  diffHookWiring,
  upstreamSettingsSummary,
  type FreshSettingsSummary,
  type HookWiringDiff,
} from './hook-wiring.js';
import {
  prepareInstall,
  upstreamSettingsCopyable,
  type PreparedInstall,
} from './install-capabilities.js';
import { manifestSources, scanDest } from './dest-drift.js';
import {
  absentInstallSurfaces,
  collectExpectedInstallPaths,
  PHARN_CONFIG_FILE,
  type AbsentSurface,
} from './install-manifest.js';
import {
  readRecords,
  recordsBaseline,
  recordsUnderCapabilities,
  type FileRecords,
} from './install-records.js';
import { detectLayout, layoutPaths } from './layout.js';
import {
  planCapabilityRemovals,
  removalBackups,
  type CapabilityDrop,
  type CapabilityRemoval,
} from './capability-removal.js';
import { recordedArchetypes } from './archetype.js';
import type { ArchetypeOrigin } from './archetype.js';
import {
  configFingerprint,
  configPath,
  readPharnConfig,
  userOwnedConfigEntries,
} from './pharn-config.js';
import {
  channelOf,
  type InstallSource,
  type RefChoice,
  type SourceSummary,
} from './release.js';
import { resolveCapabilities } from './resolve-capabilities.js';
import { readSkillsVersion } from './skills-version.js';
import { readUpstreamModels } from './upstream-models.js';
import { escapeUnsafe, terminalSafe } from './terminal-safe.js';
import { errorMessage } from './report-error.js';
import { versionStatus } from './version-status.js';
import { isPlainObject, safeJoin } from './validate.js';
import type { DriftLabel } from './dest-drift.js';
import { planWriteTargets, type WriteTargetsPlan } from './write-targets.js';
import type {
  Archetype,
  CapabilityIndex,
  InstalledCapability,
  Layout,
  PharnConfig,
  Selection,
  UnknownCapability,
} from '../types.js';

// ---------------------------------------------------------------------------
// `init`'s planning, in two read-only phases — never a write, never a log:
//
// 1. resolveInitSelection — what a run installs: the archetypes' selection plus
//    what a re-run carries over from the config it replaces. The real run and
//    `--dry-run` share it, so the carry rules have one copy.
// 2. buildInitPlan — what installing it would do to THIS project (manifest,
//    destination pre-flight, existing targets, backups, settings/hooks/models).
//    `--dry-run` prints it; the real run builds it ONCE, under the project
//    lock, after the summary is answered (so a cancelled summary builds no
//    manifest), and the overwrite prompt and the install consume it.
//
// What may change while a prompt is open is checked at write time instead of
// re-planned: each file against the hash the plan saw, each delete's backup
// set and symlink walk, and pharn.config.json against its fingerprint.
// ---------------------------------------------------------------------------

/** What a re-run `init` carries over from the config it replaces; empty for a first install. */
export interface InstallCarry {
  // `role:name` of every manual (`pharn add`) entry the fetched index still
  // has, selected by the archetypes or not. Recorded `manual`, so `update`
  // keeps them; every other installed entry is `auto`.
  manualKeys: ReadonlySet<string>;
  // Previous entries, of ANY source, upstream ships but this CLI cannot PARSE
  // (`index.unknown`): written back verbatim, listed in `frozenCapabilities`,
  // records kept, nothing copied.
  kept: readonly InstalledCapability[];
  // The replaced config's (skillsVersion, commit), or null on a first install.
  // Non-null is what makes this a RE-install: only then are the replaced
  // install's records read. The records' own stamp is never compared with it.
  previousStamp: { skillsVersion: string; commit: string | null } | null;
  // The channel THIS run installed from, recorded as `ref` — never carried from
  // the old config.
  ref?: 'latest';
  // Previous entries this install DROPS; their directories (at the pharn/
  // layout) are deleted under the lock after a backup
  // (lib/capability-removal.ts). A dropped capability of a flat install keeps
  // its old root directory: nothing is deleted outside pharn/.
  dropped?: readonly CapabilityDrop[];
}

export interface InitCarry extends InstallCarry {
  // Manual entries the index has but the archetypes did not select — installed
  // again.
  extra: InstalledCapability[];
  // Manual entries upstream no longer ships — dropped and NAMED.
  gone: InstalledCapability[];
  // EVERY previous entry this install drops: `gone`, plus `auto` and
  // source-less entries the archetypes no longer select. Never a kept or
  // re-installed entry.
  dropped: CapabilityDrop[];
}

/** A capability's identity everywhere in this CLI: the `role:name` pair. */
export function capabilityKey(cap: { name: string; role: string }): string {
  return `${cap.role}:${cap.name}`;
}

export interface PreviousConfig {
  fingerprint: string;
  config: PharnConfig | null;
  // Why a pharn.config.json that EXISTS could not be read — escaped, capped
  // display text; `null` when absent or read. Never a branch input.
  unreadable: string | null;
}

// The longest reason the summary prints, so its line stays one readable line.
const UNREADABLE_REASON_MAX = 200;

/**
 * The config a re-run init is about to replace, read TOLERANTLY: init is the
 * recovery command, so any unreadable config means "nothing to carry over",
 * never a refusal. A config that EXISTS but could not be read is NAMED
 * (`unreadable`), because carrying nothing drops the user's manual
 * capabilities. The fingerprint is taken FIRST, so a write landing between the
 * reads fails the check before the first write instead of being blessed by it.
 */
export function readPreviousConfig(cwd: string): PreviousConfig {
  const fingerprint = configFingerprint(cwd);
  try {
    const config = readPharnConfig(cwd);
    const unreadable =
      config === null && fingerprint !== 'absent'
        ? describeUnreadConfig(cwd)
        : null;
    return { fingerprint, config, unreadable };
  } catch (err) {
    // Only the FIRST sentence is the defect; the rest is repair advice for the
    // other commands ("do NOT run `pharn init`"), which would contradict init.
    const reason = escapeUnsafe(firstSentence(errorMessage(err)));
    return {
      fingerprint,
      config: null,
      unreadable: terminalSafe(reason, { max: UNREADABLE_REASON_MAX }),
    };
  }
}

/**
 * `text` up to (not including) its first `.` that sits outside a double-quoted
 * span and is followed by whitespace or the end; the whole text when there is
 * none. Display only. Exported for its tests.
 */
export function firstSentence(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (
      ch === '.' &&
      !quoted &&
      (i + 1 === text.length || /\s/.test(text[i + 1]!))
    ) {
      return text.slice(0, i);
    }
  }
  return text;
}

/**
 * Why `readPharnConfig` returned `null` for a file that exists — fixed text
 * only, never file content.
 */
function describeUnreadConfig(cwd: string): string {
  const read = readJsonBounded(configPath(cwd));
  if (read.kind === 'unusable') return `it ${read.reason}`;
  if (read.kind !== 'ok') return 'it changed while init was reading it';
  const raw = read.value;
  if (!isPlainObject(raw)) return 'it is not a JSON object';
  if (typeof raw.skillsVersion !== 'string') {
    return 'it has no "skillsVersion" string';
  }
  return 'it has neither a "capabilities" key nor a "modules" array';
}

/**
 * The summary line a re-run init prints when the config it replaces exists but
 * could not be read: nothing is carried over, so its manual capabilities are
 * dropped. Empty otherwise.
 */
export function previousConfigLines(
  previous: Pick<PreviousConfig, 'unreadable'>,
): string[] {
  if (previous.unreadable === null) return [];
  return [
    `    the previous pharn.config.json could not be read (${previous.unreadable}); nothing is carried over, so manual capabilities will be dropped`,
  ];
}

/**
 * What a re-run init carries over from the previous config, by `update`'s own
 * membership table (lib/merge-capabilities.ts). Pure.
 *
 * - Row 0: an entry of ANY source whose capability the fetch could not PARSE
 *   is KEPT verbatim — a parse failure says nothing about who asked for it.
 * - Rows 3 and 6: a `manual` entry the index still has stays `manual` (sticky).
 * - Row 7: a `manual` entry the index no longer has is dropped — and named.
 * - Everything else (`auto`, or source-less) is re-resolved from the
 *   archetypes; resolving an ABSENT source is the merge's job alone.
 *
 * `dropped` lists every previous entry that does not survive; its directory is
 * deleted by the install (after a backup), since PHARN runs whatever capability
 * directories are on disk. The first entry wins for a duplicated key.
 */
export function carryOver(
  previous: PharnConfig | null,
  index: CapabilityIndex,
  resolved: Selection,
): InitCarry {
  const inIndex = new Set(index.capabilities.map(capabilityKey));
  const frozen = new Set(index.unknown.map(capabilityKey));
  const selected = new Set(resolved.selected.map(capabilityKey));
  const manualKeys = new Set<string>();
  const kept: InstalledCapability[] = [];
  const extra: InstalledCapability[] = [];
  const gone: InstalledCapability[] = [];
  const dropped: CapabilityDrop[] = [];
  const seen = new Set<string>();
  for (const cap of previous?.capabilities ?? []) {
    const k = capabilityKey(cap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (frozen.has(k)) {
      kept.push({ ...cap });
      continue;
    }
    if (cap.source !== 'manual') {
      if (!selected.has(k)) {
        dropped.push({
          cap,
          reason:
            cap.source === 'auto' || inIndex.has(k)
              ? 'dropped-unselected'
              : 'dropped-gone',
        });
      }
      continue;
    }
    if (!inIndex.has(k)) {
      gone.push(cap);
      dropped.push({ cap, reason: 'dropped-gone' });
      continue;
    }
    manualKeys.add(k);
    if (!selected.has(k)) extra.push(cap);
  }
  return {
    manualKeys,
    kept,
    extra,
    gone,
    dropped,
    previousStamp: previous
      ? { skillsVersion: previous.skillsVersion, commit: previous.commit }
      : null,
  };
}

/**
 * The directories this re-install deletes (one per dropped capability, at the
 * pharn layout) and the files it saves first, against `records`
 * (the reinstall baseline). Reads only; throws CapabilityRemovalError for a
 * symlinked component or an unreadable file. Planned once; the install re-reads
 * the backup set at delete time (removalBackupsNow).
 */
function planInitRemovals(
  cwd: string,
  carry: InstallCarry,
  records: FileRecords | null,
): CapabilityRemoval[] {
  const drops = carry.dropped ?? [];
  if (drops.length === 0) return [];
  return planCapabilityRemovals({
    cwd,
    paths: layoutPaths('pharn'),
    drops,
    records,
    command: 'init',
  });
}

export interface InitSelection {
  previous: PreviousConfig;
  carry: InitCarry;
  // The archetypes' selection plus every carried manual entry they did not
  // select.
  selection: Selection;
}

/** Phase 1: what this run installs. Pure apart from the tolerant config read. */
export function resolveInitSelection(params: {
  cwd: string;
  archetypes: Archetype[];
  index: CapabilityIndex;
}): InitSelection {
  const { cwd, archetypes, index } = params;
  const resolved = resolveCapabilities(archetypes, index);
  // A re-run must not silently drop the user's manual adds, nor what this CLI
  // could not READ upstream (carryOver, above).
  const previous = readPreviousConfig(cwd);
  const carry = carryOver(previous.config, index, resolved);
  const extraKeys = new Set(carry.extra.map(capabilityKey));
  const selection: Selection = carry.extra.length
    ? {
        selected: [
          ...resolved.selected,
          ...carry.extra.map((c) => ({
            name: c.name,
            role: c.role,
            matched: 'manual' as const,
          })),
        ],
        // Installed now, so no longer "skipped" by the archetypes.
        skipped: resolved.skipped.filter(
          (s) => !extraKeys.has(capabilityKey(s)),
        ),
      }
    : resolved;
  return { previous, carry, selection };
}

/**
 * The records a re-install tells pharn's bytes from the user's by: the store
 * the install replaces, through `recordsBaseline`, whatever its stamp. `null`
 * (a first install, or an absent/corrupt store) means every file that differs
 * from upstream is `unverifiable`, and so backed up.
 *
 * Keyed by PATH at the old install's layout: a re-install that changed layout
 * writes new paths, so only a user file already at one of them is backed up
 * (`unrecorded`). Pinned by tests/commands/init.test.ts ("a layout change
 * (flat → pharn/) backs up only a file of yours at a new path").
 */
export function reinstallBaseline(
  cwd: string,
  carry: Pick<InstallCarry, 'previousStamp'>,
): FileRecords | null {
  return carry.previousStamp === null
    ? null
    : recordsBaseline(readRecords(cwd)).records;
}

/**
 * The paths the record store of an install from `manifest` will hold: kept
 * capabilities' records, the replaced install's orphans and the manifest — the
 * composition runInstallArchetype writes. Feeds the dry run's
 * `.prettierignore` preview.
 */
function initRecordedPaths(params: {
  cwd: string;
  manifest: ReadonlyMap<string, string>;
  carry: InstallCarry;
  capabilities: readonly InstalledCapability[];
  layout: Layout;
  baseline: FileRecords | null;
}): string[] {
  const { cwd, manifest, carry, capabilities, layout, baseline } = params;
  const kept =
    carry.kept.length === 0 || baseline === null
      ? {}
      : recordsUnderCapabilities(baseline, layoutPaths(layout), carry.kept);
  const orphans = findOrphans({
    projectRoot: cwd,
    records: baseline,
    expected: manifest,
    capabilities: [...capabilities, ...carry.kept],
    frozen: carry.kept,
  }).records;
  return [...Object.keys(kept), ...Object.keys(orphans), ...manifest.keys()];
}

/**
 * The user-owned top-level entries (`userOwnedConfigEntries`) of the config
 * this install replaces — `{}` on ANY failure, read tolerantly. Deliberately
 * NOT readPharnConfig, whose null/throw verdicts are about the keys pharn OWNS
 * and would drop `testResults` on exactly the recovery path pharn prescribes;
 * the one requirement is a top-level JSON object. A total-catch reader is right
 * for carrying keys across and wrong for anything that must refuse a config.
 */
export function readCarriedEntries(cwd: string): Record<string, unknown> {
  const read = readJsonBounded(configPath(cwd));
  if (read.kind !== 'ok') return {};
  return isPlainObject(read.value) ? userOwnedConfigEntries(read.value) : {};
}

/** One write target and what the install would do to it. */
export interface InitTarget {
  rel: string;
  // `overwrite` ⇔ the path exists now (`conflictingWriteTargets`' test).
  action: 'create' | 'overwrite';
  // Why it would be backed up first, or null: update's drift label, or
  // `rewritten` for an existing pharn.config.json (always backed up).
  label: DriftLabel | 'rewritten' | null;
}

/** What `pharn init --dry-run` found: plain data, JSON-safe. */
export interface InitPlanReport {
  archetypes: Archetype[];
  // Detection (with its evidence) or `--archetype`.
  archetypeOrigin: ArchetypeOrigin;
  // The replaced config's canonical `archetypes`, or null — display only.
  previousArchetypes: Archetype[] | null;
  channelLines: string[];
  // Text only: not projected into `--dry-run --json`.
  previousConfigLines: string[];
  channel: RefChoice;
  source: InstallSource;
  commit: string | null;
  skillsVersion: string;
  layout: Layout;
  selection: Selection;
  carry: {
    // `role:name` of every entry that would be recorded `manual`, sorted.
    manual: string[];
    extra: InstalledCapability[];
    kept: InstalledCapability[];
    gone: InstalledCapability[];
  };
  unknownCapabilities: UnknownCapability[];
  // Every write target (the manifest plus pharn.config.json), sorted by path.
  targets: InitTarget[];
  // The existing ones, labelled first — the prompt's order.
  conflicts: string[];
  // An existing pharn.config.json would be rewritten, and backed up first.
  configBackedUp: boolean;
  // Dropped capability directories it would delete, with their backups.
  removals: CapabilityRemoval[];
  // Everything it would back up first: overwrites, the replaced config and the
  // removals' files.
  backups: string[];
  counts: { create: number; overwrite: number; backup: number };
  settingsPreserved: boolean;
  // Compared only when settings.json would be preserved; null otherwise.
  hookWiring: HookWiringDiff | null;
  // What the settings.json a fresh install would WRITE wires (the real run's
  // HOOKS note). Non-null only when the project has none and the clone's is
  // copyable (upstreamSettingsCopyable).
  freshSettings: FreshSettingsSummary | null;
  // Reasons quote upstream bytes.
  models: { outcome: 'copy' | 'none' | 'rejected'; reasons: string[] };
  // Declared surfaces the clone ships no file for (absentInstallSurfaces).
  absentUpstream: AbsentSurface[];
  // The NAMES of the replaced config's unowned keys, never their values.
  carriedConfigKeys: string[];
  // `none` when `.gitignore` already covers pharn's entries.
  gitignore: GitignorePlan;
  // `none` when the project does not use Prettier or is already covered.
  prettierignore: PrettierignorePlan;
}

/**
 * The summary lines a RE-RUN init prints when it moves an install off `main`
 * (no `--ref`, the replaced config follows `main`, this run takes `latest`),
 * plus a warning when the installed version is newer than that release, i.e.
 * the re-install goes BACK. Empty otherwise. Pure.
 */
export function previousChannelLines(params: {
  previous: { ref?: unknown; skillsVersion?: unknown } | null;
  channel: RefChoice;
  explicit: boolean;
  source: SourceSummary;
}): string[] {
  const { previous, channel, explicit, source } = params;
  if (previous === null || explicit) return [];
  if (channel !== 'latest' || channelOf(previous) !== 'main') return [];
  const lines = [
    '    previously followed: main (the pharn-oss tip) — pass --ref main to keep it',
  ];
  const installed = previous.skillsVersion;
  if (
    source.kind === 'release' &&
    typeof installed === 'string' &&
    versionStatus({ installed, latest: source.version }).ahead
  ) {
    lines.push(
      `    installed v${terminalSafe(installed, { max: 40 })} is newer than release ${source.tag} — this re-install goes back to it`,
    );
  }
  return lines;
}

/**
 * What only the real install needs from the plan — never printed. Every value
 * was computed ONCE, by `buildInitPlan`, before the overwrite prompt; the
 * install consumes it under the same lock instead of recomputing it.
 */
export interface InitApplyInputs {
  // The checked destination: layout paths + the manifest (dest → source).
  prepared: PreparedInstall;
  // Existing manifest files the install backs up first (update's SKIP rows).
  drifted: string[];
  // What each manifest destination held when planned (hash, or null): a file
  // edited while a prompt was open is backed up before it is overwritten.
  seen: ReadonlyMap<string, string | null>;
  // The replaced install's records baseline, or null.
  baseline: FileRecords | null;
  removals: CapabilityRemoval[];
  // The prompt's (and `--yes`'s) view of the existing targets.
  targets: WriteTargetsPlan;
  // pharn.config.json's bytes when the carry-over read it, taken before that
  // read: checked again before the first write.
  fingerprint: string;
}

export interface PlannedInit {
  report: InitPlanReport;
  apply: InitApplyInputs;
}

/**
 * Phase 2: what installing `chosen.selection` from `repoDir` would do to `cwd`
 * — the one plan of a run, shared by `--dry-run` (which prints `report`) and
 * the real install (which consumes both halves). Read-only; throws what a real
 * run throws at the same step.
 */
export function buildInitPlan(params: {
  repoDir: string;
  cwd: string;
  sha: string | null;
  source: InstallSource;
  channel: RefChoice;
  archetypes: Archetype[];
  // Defaults to "detected, no evidence" for a caller that has none.
  origin?: ArchetypeOrigin;
  index: CapabilityIndex;
  chosen: InitSelection;
  // Whether `--ref` was passed: then the summary names no channel change.
  refExplicit?: boolean;
}): PlannedInit {
  const { repoDir, cwd, sha, source, channel, archetypes, index, chosen } =
    params;
  const origin: ArchetypeOrigin = params.origin ?? {
    kind: 'detected',
    evidence: [],
    truncated: false,
  };
  const { selection, carry } = chosen;
  const layout = detectLayout(repoDir);
  const manifest = collectExpectedInstallPaths({
    repoDir,
    capabilities: selection.selected,
  });
  // The destination pre-flight, once per run: a refused project is refused
  // before any prompt and before anything is written.
  const prepared = prepareInstall(repoDir, cwd, selection.selected, manifest);
  // The replaced install's records, read once.
  const baseline = reinstallBaseline(cwd, carry);
  // The dropped capabilities' directories, refused here when unsafe.
  const removals = planInitRemovals(cwd, carry, baseline);
  // ONE scan of every manifest destination: what the install backs up
  // (`drifted`, by update's own table), what the writer compares against
  // (`seen`), and the prompt's labels.
  const scan = scanDest({
    repoDir,
    projectRoot: cwd,
    rels: [...manifest.keys()],
    sources: manifestSources(repoDir, manifest),
    records: baseline,
  });
  const writeTargets = planWriteTargets({
    repoDir,
    projectRoot: cwd,
    capabilities: selection.selected,
    manifest,
    records: baseline,
    removals,
    labels: scan.labels,
  });
  const { conflicts, labels, configBackedUp } = writeTargets;
  const existing = new Set(conflicts);
  const targets: InitTarget[] = [
    ...new Set([...manifest.keys(), PHARN_CONFIG_FILE]),
  ]
    .sort()
    .map((rel) => ({
      rel,
      action: existing.has(rel) ? ('overwrite' as const) : ('create' as const),
      label:
        labels.get(rel) ??
        (configBackedUp && rel === PHARN_CONFIG_FILE
          ? ('rewritten' as const)
          : null),
    }));
  // What runInstallArchetype backs up (plus a removal file edited since).
  const backups = [
    ...new Set([
      ...[...labels.keys()].sort(),
      ...(configBackedUp ? [PHARN_CONFIG_FILE] : []),
      ...removalBackups(removals),
    ]),
  ];

  // `existsSync` FOLLOWS a link, as the install's own test does.
  const settingsPreserved = existsSync(safeJoin(cwd, CLAUDE_SETTINGS_FILE));
  const upstreamModels = readUpstreamModels(repoDir);

  const report: InitPlanReport = {
    archetypes,
    archetypeOrigin: origin,
    previousArchetypes: recordedArchetypes(chosen.previous.config?.archetypes),
    channelLines: previousChannelLines({
      previous: chosen.previous.config,
      channel,
      explicit: params.refExplicit ?? false,
      source,
    }),
    previousConfigLines: previousConfigLines(chosen.previous),
    channel,
    source,
    commit: sha,
    skillsVersion: readSkillsVersion(repoDir),
    layout,
    selection,
    carry: {
      manual: [...carry.manualKeys].sort(),
      extra: carry.extra,
      kept: [...carry.kept],
      gone: carry.gone,
    },
    unknownCapabilities: index.unknown,
    targets,
    conflicts,
    configBackedUp,
    removals,
    backups,
    counts: {
      create: targets.length - existing.size,
      overwrite: existing.size,
      backup: backups.length,
    },
    settingsPreserved,
    hookWiring: settingsPreserved ? diffHookWiring(repoDir, cwd) : null,
    freshSettings:
      !settingsPreserved && upstreamSettingsCopyable(repoDir)
        ? upstreamSettingsSummary(repoDir)
        : null,
    models:
      upstreamModels.kind === 'ok'
        ? { outcome: 'copy', reasons: [] }
        : upstreamModels.kind === 'absent'
          ? { outcome: 'none', reasons: [] }
          : { outcome: 'rejected', reasons: upstreamModels.reasons },
    absentUpstream: absentInstallSurfaces({ repoDir }),
    carriedConfigKeys: Object.keys(readCarriedEntries(cwd)),
    gitignore: planGitignore(cwd),
    prettierignore: planPrettierignore(
      cwd,
      initRecordedPaths({
        cwd,
        manifest,
        carry,
        capabilities: selection.selected,
        layout,
        baseline,
      }),
    ),
  };
  return {
    report,
    apply: {
      prepared,
      drifted: scan.drifted,
      seen: scan.seen,
      baseline,
      removals,
      targets: writeTargets,
      fingerprint: chosen.previous.fingerprint,
    },
  };
}
