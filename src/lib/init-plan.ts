import { existsSync } from 'node:fs';
import { CLAUDE_SETTINGS_FILE } from './constants.js';
import { readBoundedFile } from './bounded-read.js';
import { diffHookWiring, type HookWiringDiff } from './hook-wiring.js';
import { prepareInstall } from './install-capabilities.js';
import {
  absentInstallSurfaces,
  collectExpectedInstallPaths,
  PHARN_CONFIG_FILE,
  type AbsentSurface,
} from './install-manifest.js';
import {
  readRecords,
  recordsBaseline,
  type FileRecords,
} from './install-records.js';
import { detectLayout } from './layout.js';
import { recordedArchetypes } from './archetype.js';
import type { ArchetypeOrigin } from './archetype.js';
import {
  configFingerprint,
  configPath,
  readPharnConfig,
  userOwnedConfigEntries,
} from './pharn-config.js';
import type { InstallSource, RefChoice } from './release.js';
import { resolveCapabilities } from './resolve-capabilities.js';
import { readSkillsVersion } from './skills-version.js';
import { readUpstreamModels } from './upstream-models.js';
import { isPlainObject, safeJoin } from './validate.js';
import type { DriftLabel } from './dest-drift.js';
import { planWriteTargets } from './write-targets.js';
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
// 1. resolveInitSelection — what a run installs: the archetypes' selection,
//    plus what a re-run carries over from the config it replaces. The real run
//    and `--dry-run` both call it, so the carry rules have one copy.
// 2. buildInitPlan — what installing that selection would do to THIS project:
//    the manifest, the destination pre-flight (which THROWS, as in a real run),
//    the targets that exist, the files that would be backed up, the settings /
//    hooks / models outcomes. Only `--dry-run` calls it: the real run computes
//    the same things one step at a time, between its prompts, so that a
//    cancelled summary builds no manifest (commands/init.ts).
//
// The plan is a SNAPSHOT (advisory): a real run re-fetches and re-checks
// everything under its lock.
// ---------------------------------------------------------------------------

/**
 * What a re-run `init` carries over from the config it replaces (built here by
 * carryOver). Empty for a first install.
 */
export interface InstallCarry {
  // `role:name` of every capability the user added by hand (`pharn add` →
  // `source: 'manual'`) that the fetched index still has — selected by the
  // archetypes or not. Recorded `manual`, so `pharn update` keeps them (its merge
  // table, rows 3 and 6); every other installed entry is `auto`.
  manualKeys: ReadonlySet<string>;
  // Previous entries, of ANY source, whose capability upstream still ships but
  // this CLI could not PARSE (`index.unknown`) — `update`'s row 0. Nothing is
  // copied for them: each is written back VERBATIM, listed in
  // `frozenCapabilities` so `update` re-checks it, and keeps its records.
  kept: readonly InstalledCapability[];
  // The (skillsVersion, commit) of the config being replaced — the stamp the
  // records store must carry for a kept entry's records to be trusted.
  previousStamp: { skillsVersion: string; commit: string | null } | null;
  // Not carried over: the channel THIS run installed from, recorded as the
  // config's `ref` — `"latest"` for `--ref latest`, absent (the `main`
  // default) otherwise. A re-run init follows its own flag, never the old
  // config's channel (lib/release.ts).
  ref?: 'latest';
}

export interface InitCarry extends InstallCarry {
  // Manual entries the index has but the archetypes did not select — added to
  // the selection so they are installed again (row 6).
  extra: InstalledCapability[];
  // Manual entries upstream no longer ships — dropped and NAMED (row 7).
  gone: InstalledCapability[];
}

/** A capability's identity everywhere in this CLI: the `role:name` pair. */
export function capabilityKey(cap: { name: string; role: string }): string {
  return `${cap.role}:${cap.name}`;
}

export interface PreviousConfig {
  fingerprint: string;
  config: PharnConfig | null;
}

/**
 * The config a re-run init is about to replace, read TOLERANTLY: init is the
 * command every other one points at for recovery, so an absent, unreadable,
 * invalid or pre-archetype config simply means "nothing to carry over" — never
 * a refusal. The fingerprint is taken FIRST, so a write that lands between the
 * two reads fails the under-lock check (closed) instead of being blessed by it.
 */
export function readPreviousConfig(cwd: string): PreviousConfig {
  const fingerprint = configFingerprint(cwd);
  let config: PharnConfig | null;
  try {
    config = readPharnConfig(cwd);
  } catch {
    config = null;
  }
  return { fingerprint, config };
}

/**
 * What a re-run init carries over from the previous config, by `update`'s own
 * membership table (lib/merge-capabilities.ts — cited, not restated, P4). Pure:
 * every branch is a `role:name` set lookup or an exact `source` compare (P5).
 *
 * - Row 0: an entry of ANY source whose capability the fetch could not PARSE
 *   (`index.unknown`) is KEPT verbatim — a parse failure is evidence about
 *   upstream's bytes, not about who asked for it.
 * - Rows 3 and 6: a `manual` entry the index still has stays `manual`, whether
 *   or not the archetypes also select it (sticky).
 * - Row 7: a `manual` entry the index no longer has is dropped — and named.
 * - Everything else (`auto`, or a legacy entry with no `source`) is simply
 *   re-resolved from the archetypes: init starts over. Resolving an ABSENT
 *   source is the merge's job alone, so it is not inferred here.
 *
 * The first entry wins for a duplicated key, as in the merge.
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
  const seen = new Set<string>();
  for (const cap of previous?.capabilities ?? []) {
    const k = capabilityKey(cap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (frozen.has(k)) {
      kept.push({ ...cap });
      continue;
    }
    if (cap.source !== 'manual') continue;
    if (!inIndex.has(k)) {
      gone.push(cap);
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
    previousStamp: previous
      ? { skillsVersion: previous.skillsVersion, commit: previous.commit }
      : null,
  };
}

export interface InitSelection {
  previous: PreviousConfig;
  carry: InitCarry;
  // The archetypes' selection, plus every carried manual entry they did not
  // select (matched: 'manual', and no longer listed as skipped).
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
  // A re-run init must not silently drop what the user added by hand, nor what
  // this CLI merely could not READ upstream: the config it replaces is carried
  // over by `update`'s own merge rules (carryOver, above).
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
 * the install replaces, through `update`'s own gate (`recordsBaseline`) against
 * the stamp of the config it replaces. `null` — a first install, or a store
 * that is absent, corrupt or stamped for another install state — means every
 * file that differs from upstream is `unverifiable`, and so backed up: never
 * minted, never blessed, never guessed about.
 *
 * Keyed by PATH, at the layout of the install that wrote it. A re-install
 * whose clone changed layout (flat → pharn/) writes to new paths, which the
 * project does not have yet, and leaves the old files in place (init never
 * deletes) — so it backs up nothing extra. Only a file of the user's own
 * already at one of the new paths has no record there, and is backed up
 * (`unrecorded`). Pinned by tests/init-archetype.test.ts.
 */
export function reinstallBaseline(
  cwd: string,
  previousStamp: InstallCarry['previousStamp'],
): FileRecords | null {
  return previousStamp === null
    ? null
    : recordsBaseline(readRecords(cwd), previousStamp).records;
}

/**
 * The user-owned top-level entries (`userOwnedConfigEntries`) of the
 * pharn.config.json this install is about to replace — `{}` on ANY failure.
 * Read TOLERANTLY, like readPreviousConfig: init is the command every other one
 * points at for recovery, so an absent, unreadable or unparseable config means
 * "nothing to carry over", never a refusal.
 *
 * Deliberately NOT readPharnConfig, whose verdict is about the keys pharn OWNS:
 * it returns null for a config with no `modules` array — which every other
 * command answers with "Run `pharn init` first" — and throws on a bad `seam`
 * hand-edit. Neither says anything about the user's own keys, and reading
 * through it would drop `testResults` on exactly the recovery path pharn
 * prescribes. So the one requirement is a JSON object at top level. Exported
 * for init alone (the install's write and the dry run's preview): a total-catch
 * reader is right for carrying keys across and wrong for anything that must
 * refuse a config it failed to understand.
 */
export function readCarriedEntries(cwd: string): Record<string, unknown> {
  // Bounded and non-blocking (lib/bounded-read.ts), like every read of this file.
  const read = readBoundedFile(configPath(cwd));
  if (read.kind !== 'ok') return {};
  try {
    const raw: unknown = JSON.parse(read.bytes.toString('utf8'));
    return isPlainObject(raw) ? userOwnedConfigEntries(raw) : {};
  } catch {
    return {};
  }
}

/** One write target and what the install would do to it. */
export interface InitTarget {
  rel: string;
  // `overwrite` ⇔ the path exists now (`conflictingWriteTargets`' test).
  action: 'create' | 'overwrite';
  // Why it would be backed up first, or null when it would not be:
  // update's drift label, or `rewritten` for an existing pharn.config.json,
  // which init rebuilds (`seam` and `models` reset) and always backs up.
  label: DriftLabel | 'rewritten' | null;
}

/** What `pharn init --dry-run` found: plain data, JSON-safe. */
export interface InitPlanReport {
  archetypes: Archetype[];
  // Where `archetypes` came from: detection (with its evidence) or
  // `--archetype` (with what detection found instead).
  archetypeOrigin: ArchetypeOrigin;
  // The replaced config's `archetypes` reduced to canonical members, or null —
  // display only (the summary's "previously recorded" line).
  previousArchetypes: Archetype[] | null;
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
  // The existing ones, labelled first — the order the prompt lists them in.
  conflicts: string[];
  // An existing pharn.config.json would be rewritten, and backed up first.
  configBackedUp: boolean;
  // What the install would copy to `.pharn-backup/<timestamp>/` first.
  backups: string[];
  counts: { create: number; overwrite: number; backup: number };
  settingsPreserved: boolean;
  // Compared only when settings.json would be preserved (a fresh one is
  // written from upstream); null otherwise.
  hookWiring: HookWiringDiff | null;
  // pharn-oss's models block: copied, absent upstream, or rejected (reasons
  // quote upstream bytes).
  models: { outcome: 'copy' | 'none' | 'rejected'; reasons: string[] };
  // The declared product surfaces the clone ships no file for, at its layout
  // (lib/install-manifest.ts → absentInstallSurfaces) — what a real run warns
  // about after the copy.
  absentUpstream: AbsentSurface[];
  // The top-level keys of the replaced config that pharn does not own — the
  // NAMES only, never their values.
  carriedConfigKeys: string[];
}

/**
 * Phase 2: what installing `chosen.selection` from `repoDir` would do to `cwd`.
 * Read-only; throws what a real run throws at the same step
 * (ManifestValidationError from the pre-flight, a bad SKILLS_VERSION).
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
}): InitPlanReport {
  const { repoDir, cwd, sha, source, channel, archetypes, index, chosen } =
    params;
  const origin: ArchetypeOrigin = params.origin ?? {
    kind: 'detected',
    evidence: [],
  };
  const { selection, carry } = chosen;
  const layout = detectLayout(repoDir);
  const manifest = collectExpectedInstallPaths({
    repoDir,
    capabilities: selection.selected,
    layout,
  });
  // The destination pre-flight a real run makes before its overwrite prompt:
  // a project the install could not finish in is refused here too.
  prepareInstall(repoDir, cwd, selection.selected, manifest);

  const { conflicts, labels, configBackedUp } = planWriteTargets({
    repoDir,
    projectRoot: cwd,
    capabilities: selection.selected,
    manifest,
    records: reinstallBaseline(cwd, carry.previousStamp),
  });
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
  // What runInstallArchetype backs up under the lock: the drifted files, then
  // the replaced config (steps/install-archetype.ts).
  const backups = [
    ...[...labels.keys()].sort(),
    ...(configBackedUp ? [PHARN_CONFIG_FILE] : []),
  ];

  // `existsSync` FOLLOWS a link, exactly as the install's own test does
  // (lib/install-capabilities.ts), so a live settings link counts as preserved.
  const settingsPreserved = existsSync(safeJoin(cwd, CLAUDE_SETTINGS_FILE));
  const upstreamModels = readUpstreamModels(repoDir);

  return {
    archetypes,
    archetypeOrigin: origin,
    previousArchetypes: recordedArchetypes(chosen.previous.config?.archetypes),
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
    backups,
    counts: {
      create: targets.length - existing.size,
      overwrite: existing.size,
      backup: backups.length,
    },
    settingsPreserved,
    hookWiring: settingsPreserved ? diffHookWiring(repoDir, cwd) : null,
    models:
      upstreamModels.kind === 'ok'
        ? { outcome: 'copy', reasons: [] }
        : upstreamModels.kind === 'absent'
          ? { outcome: 'none', reasons: [] }
          : { outcome: 'rejected', reasons: upstreamModels.reasons },
    absentUpstream: absentInstallSurfaces({ repoDir, layout }),
    carriedConfigKeys: Object.keys(readCarriedEntries(cwd)),
  };
}
