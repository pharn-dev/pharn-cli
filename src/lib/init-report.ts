import type { ArchetypeEvidence } from './archetype.js';
import type { DriftLabel } from './dest-drift.js';
import type { HookEntry, HookWiringDiff } from './hook-wiring.js';
import type { InitPlanReport } from './init-plan.js';
import type { InstallSurface } from './install-manifest.js';
import { cap } from './json-report.js';
import type { InstallSource, RefChoice } from './release.js';
import type { Archetype, Layout, SelectedCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The `pharn init --dry-run --json` report: ONE pure object, projected from the
// planner's `InitPlanReport` and serialized once by `serializeJsonReport`
// (lib/json-report.ts). No I/O, no clack, no exit — so the text preview and the
// JSON cannot disagree about a value.
//
// An EXPLICIT field-by-field projection, never a spread: a field added to
// `InitPlanReport` later does not become public contract by accident. `models`
// carries the outcome and the reasons, never the block itself (arbitrary
// upstream JSON). The user's own config keys appear by NAME only.
//
// `schemaVersion` is matched exactly by a consumer (P5): additive keys may
// arrive within 1, a breaking change bumps it. Its own constant — this report
// versions independently of `status --json` and `update --dry-run --json`. That
// stability is a documented contract (advisory); the floor cannot enforce it.
//
// Trust (P2): every free-text field is UNTRUSTED DATA — serialized as a JSON
// string, never interpreted, capped here and escaped by `serializeJsonReport`.
// Enum-like fields (`status`, `action`, `label`, `outcome`, `channel`,
// `source.kind`, `hooks.status`) come from this CLI's own membership tests.
// ---------------------------------------------------------------------------

export const INIT_SCHEMA_VERSION = 1;

// The caps `update --dry-run --json` and `status --json` apply to the same
// kinds of field.
const MAX_REASON = 300;
const MAX_UNKNOWN_FIELD = 200;
// An evidence path is a name from the user's own tree; the summary caps it at
// 120 for the terminal, the report at the same 200 as other free text.
const MAX_EVIDENCE = 200;

export interface InitReport {
  schemaVersion: typeof INIT_SCHEMA_VERSION;
  command: 'init';
  dryRun: true;
  status: 'planned';
  channel: RefChoice;
  source: { kind: InstallSource['kind']; tag: string | null };
  commit: string | null;
  skillsVersion: string;
  layout: Layout;
  archetypes: Archetype[];
  // Where `archetypes` came from: `detected`, or `flag` (`--archetype`).
  archetypeSource: 'detected' | 'flag';
  // With `archetypeSource: "flag"`, the set detection found and did not use;
  // `null` otherwise.
  detectedArchetypes: Archetype[] | null;
  // DETECTION's evidence, one entry per detected archetype: the dependency
  // name (`source: "dependency"`), the first triggering project-relative path
  // (`"path"`, directories end in `/`), or `null` for `lib` (`"none"`). With
  // `archetypeSource: "flag"` it describes `detectedArchetypes`.
  archetypeEvidence: {
    archetype: Archetype;
    source: ArchetypeEvidence['source'];
    value: string | null;
  }[];
  capabilities: {
    selected: {
      role: SelectedCapability['role'];
      name: string;
      matched: SelectedCapability['matched'];
    }[];
    skipped: {
      role: SelectedCapability['role'];
      name: string;
      reason: string;
    }[];
    carried: { manual: string[]; kept: string[]; dropped: string[] };
  };
  unknownCapabilities: {
    role: string;
    name: string;
    subtree: string;
    reason: string;
  }[];
  targets: {
    rel: string;
    action: 'create' | 'overwrite';
    label: DriftLabel | 'rewritten' | null;
  }[];
  backups: string[];
  counts: { create: number; overwrite: number; backup: number };
  // Exactly `counts.overwrite === 0`: whether `pharn init --yes` would install
  // into this project now (it refuses wherever anything would be overwritten).
  yesWouldProceed: boolean;
  settings: { preserved: boolean };
  hooks: {
    status: HookWiringDiff['status'];
    missing: HookEntry[];
    localOnly: HookEntry[];
    file: string | null;
    reason: string | null;
  } | null;
  // Present ONLY when there is one: the declared surfaces the clone ships no
  // file for (as `update --dry-run --json`'s `plan.absentUpstream`).
  absentUpstream?: { surface: InstallSurface; path: string }[];
  models: { outcome: InitPlanReport['models']['outcome']; reasons: string[] };
  config: { carriedKeys: string[] };
}

const key = (c: { role: string; name: string }): string =>
  `${c.role}:${c.name}`;

export function buildInitReport(p: InitPlanReport): InitReport {
  return {
    schemaVersion: INIT_SCHEMA_VERSION,
    command: 'init',
    dryRun: true,
    status: 'planned',
    channel: p.channel,
    source: {
      kind: p.source.kind,
      tag: p.source.kind === 'release' ? p.source.tag : null,
    },
    commit: p.commit,
    skillsVersion: p.skillsVersion,
    layout: p.layout,
    archetypes: [...p.archetypes],
    archetypeSource: p.archetypeOrigin.kind,
    detectedArchetypes:
      p.archetypeOrigin.kind === 'flag'
        ? [...p.archetypeOrigin.detected]
        : null,
    archetypeEvidence: p.archetypeOrigin.evidence.map((e) => ({
      archetype: e.archetype,
      source: e.source,
      value:
        e.source === 'dependency'
          ? e.name
          : e.source === 'path'
            ? cap(e.path, MAX_EVIDENCE)
            : null,
    })),
    capabilities: {
      selected: p.selection.selected.map((c) => ({
        role: c.role,
        name: c.name,
        matched: Array.isArray(c.matched) ? [...c.matched] : c.matched,
      })),
      skipped: p.selection.skipped.map((c) => ({
        role: c.role,
        name: c.name,
        reason: cap(c.reason, MAX_REASON),
      })),
      carried: {
        manual: [...p.carry.manual],
        kept: p.carry.kept.map(key),
        dropped: p.carry.gone.map(key),
      },
    },
    unknownCapabilities: p.unknownCapabilities.map((u) => ({
      role: u.role,
      name: cap(u.name, MAX_UNKNOWN_FIELD),
      subtree: cap(u.subtree, MAX_UNKNOWN_FIELD),
      reason: cap(u.reason, MAX_UNKNOWN_FIELD),
    })),
    targets: p.targets.map((t) => ({
      rel: t.rel,
      action: t.action,
      label: t.label,
    })),
    backups: [...p.backups],
    counts: {
      create: p.counts.create,
      overwrite: p.counts.overwrite,
      backup: p.counts.backup,
    },
    yesWouldProceed: p.counts.overwrite === 0,
    settings: { preserved: p.settingsPreserved },
    hooks:
      p.hookWiring === null
        ? null
        : {
            status: p.hookWiring.status,
            missing: p.hookWiring.missing,
            localOnly: p.hookWiring.localOnly ?? [],
            file: p.hookWiring.file ?? null,
            reason: p.hookWiring.reason ?? null,
          },
    ...(p.absentUpstream.length > 0
      ? {
          absentUpstream: p.absentUpstream.map((a) => ({
            surface: a.surface,
            path: cap(a.path, MAX_UNKNOWN_FIELD),
          })),
        }
      : {}),
    models: {
      outcome: p.models.outcome,
      reasons: p.models.reasons.map((r) => cap(r, MAX_REASON)),
    },
    config: {
      carriedKeys: p.carriedConfigKeys.map((k) => cap(k, MAX_UNKNOWN_FIELD)),
    },
  };
}
