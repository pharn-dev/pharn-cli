import type { HookEntry, HookWiringDiff } from './hook-wiring.js';
import { cap } from './json-report.js';
import type { CapabilityChange } from './merge-capabilities.js';
import type { ModelsOutcome } from './models-update.js';
import type { InstallSource, RefChoice } from './release.js';
import type {
  PlannedFile,
  UpdateLabel,
  UpdatePlan,
} from './update-decision.js';
import type { CapabilityRemoval, UpdatePlanReport } from './update-plan.js';
import type { OrphanState } from './orphans.js';
import type { InstallSurface } from './install-manifest.js';
import type { Layout } from '../types.js';

// ---------------------------------------------------------------------------
// The `pharn update --dry-run --json` report: ONE pure object, built from what
// the command already computed (the planner's `UpdatePlanReport`, or just the
// early-return outcome), serialized once by `serializeJsonReport`. No I/O, no
// clack, no exit — so the text notes and the JSON cannot disagree about a value.
//
// It is an EXPLICIT field-by-field projection, never a spread: a field added to
// `UpdatePlanReport` later does not become public contract by accident. `models`
// omits the block itself (`next`) and its record hash — arbitrary upstream JSON
// and an internal value; the outcome and the reasons are what a reader acts on.
//
// `schemaVersion` is matched exactly by a consumer (P5): additive keys may
// arrive within 1, a breaking change bumps it. Its own constant — this report
// versions independently of `status --json`'s. That stability is a documented
// contract (advisory); the floor cannot enforce it.
//
// Trust (P2): every free-text field is UNTRUSTED DATA — serialized as a JSON
// string, never interpreted, capped here and escaped by `serializeJsonReport`.
// Enum-like fields (`status`, `action`, `label`, `outcome`, `reason`, `channel`,
// `source.kind`, `hooks.status`) come from this CLI's own membership tests.
// ---------------------------------------------------------------------------

export const UPDATE_SCHEMA_VERSION = 1;

// Same caps the text surfaces and `status --json` apply to the same fields.
const MAX_REASON = 300;
const MAX_UNKNOWN_FIELD = 200;

// `ahead-of-release` / `ahead-of-main`: the install is newer than the source it
// follows (the newest verified release, or a main that moved back) and a real
// run would change nothing without `--force`.
export type UpdateStatus =
  'planned' | 'up-to-date' | 'ahead-of-release' | 'ahead-of-main';

export interface UpdateReport {
  schemaVersion: typeof UPDATE_SCHEMA_VERSION;
  command: 'update';
  dryRun: true;
  // Present (as `true`) ONLY under `--compact`, on every status: the list in
  // `plan.files` may then be filtered, see `plan.filesOmitted`. Absent in the
  // default report, which is byte-identical to the one 0.10.0 shipped.
  compact?: true;
  // `planned` ⇒ `plan` is set; the early returns ⇒ `plan` is null.
  status: UpdateStatus;
  force: boolean;
  channel: RefChoice;
  // What a real run would record when `--ref` switches channel; else null.
  channelChange: { from: RefChoice; to: RefChoice } | null;
  source: { kind: InstallSource['kind']; tag: string | null };
  version: {
    installed: string;
    latest: string;
    // The version a real run would record; null when no plan was made.
    recorded: string | null;
    withheld: boolean | null;
    pending: string | null;
  };
  archetypes: string[];
  plan: {
    layout: Layout;
    abandonedLayout: Layout | null;
    featuresReadmeRelocation: boolean;
    capabilities: {
      count: number;
      changes: {
        role: CapabilityChange['cap']['role'];
        name: string;
        source: 'auto' | 'manual' | null;
        reason: CapabilityChange['reason'];
      }[];
      // The capability directories a real run would DELETE — one per entry it
      // drops from the config — and the files it would back up first. Present
      // ONLY when there is one (read it as `?? []`), so a report without a drop
      // stays byte-identical to earlier releases; added within 1.
      removals?: {
        role: CapabilityRemoval['cap']['role'];
        name: string;
        reason: CapabilityRemoval['reason'];
        dir: string;
        present: boolean;
        backups: string[];
      }[];
    };
    files: {
      rel: string;
      action: PlannedFile['action'];
      label: PlannedFile['label'];
      backup: boolean;
      forced: boolean;
    }[];
    // Present ONLY under `--compact`: what `files` leaves out. The count always
    // equals `counts.ok`, so `files.length + count` is the installed-file total.
    filesOmitted?: { action: 'noop'; count: number };
    writes: string[];
    backups: string[];
    skipped: { label: UpdateLabel | 'unreadable'; rels: string[] }[];
    counts: UpdatePlan['counts'];
    models: {
      outcome: ModelsOutcome;
      label: UpdateLabel | null;
      replacedLegacyDefault: boolean;
      backup: boolean;
      conversion: { changes: string[]; leftovers: string[] } | null;
      problems: string[];
      upstreamReasons: string[];
    };
    hooks: {
      status: HookWiringDiff['status'];
      missing: HookEntry[];
      localOnly: HookEntry[];
      file: string | null;
      reason: string | null;
    };
    // The declared product surfaces the clone ships no file for. Present ONLY
    // when there is one, so a report with none keeps the 0.10.0 bytes.
    absentUpstream?: { surface: InstallSurface; path: string }[];
    frozenCapabilities: string[];
    unknownCapabilities: {
      role: string;
      name: string;
      subtree: string;
      reason: string;
    }[];
    recordsNote: string | null;
    // Recorded files upstream no longer ships, still on disk (lib/orphans.ts).
    // Present ONLY when there is at least one, so a report with none keeps the
    // bytes 0.10.0 shipped; additive within schemaVersion 1; never filtered by
    // `--compact`.
    orphans?: { path: string; state: OrphanState; reason?: string }[];
  } | null;
}

export interface UpdateReportInput {
  status: UpdateStatus;
  force: boolean;
  // The channel this run resolved, and the one the config records.
  channel: RefChoice;
  currentChannel: RefChoice;
  source: InstallSource;
  // `config.skillsVersion`, and the version the source ships.
  installed: string;
  latest: string;
  archetypes: readonly string[];
  // The planner's report; null on an early return.
  plan: UpdatePlanReport | null;
  // `--compact`: omit the `noop` entries of `plan.files` and say so.
  compact?: boolean;
}

const capAll = (values: readonly string[], max: number): string[] =>
  values.map((v) => cap(v, max));

function planReport(
  p: UpdatePlanReport,
  compact: boolean,
): NonNullable<UpdateReport['plan']> {
  // Membership on the `UpdateAction` enum, nothing heuristic: every other
  // entry is kept whole, and `counts` is never filtered.
  const kept = compact ? p.files.filter((f) => f.action !== 'noop') : p.files;
  return {
    layout: p.layout,
    abandonedLayout: p.abandonedLayout,
    featuresReadmeRelocation: p.featuresReadmeRelocation,
    capabilities: {
      count: p.capCount,
      changes: p.capabilityChanges.map((c) => ({
        role: c.cap.role,
        name: c.cap.name,
        source: c.cap.source ?? null,
        reason: c.reason,
      })),
      ...(p.removals.length > 0
        ? {
            removals: p.removals.map((r) => ({
              role: r.cap.role,
              name: r.cap.name,
              reason: r.reason,
              dir: r.dir,
              present: r.present,
              backups: [...r.backups],
            })),
          }
        : {}),
    },
    files: kept.map((f) => ({
      rel: f.rel,
      action: f.action,
      label: f.label,
      backup: f.backup,
      forced: f.forced,
    })),
    ...(compact
      ? {
          filesOmitted: {
            action: 'noop' as const,
            count: p.files.length - kept.length,
          },
        }
      : {}),
    writes: [...p.writes],
    backups: [...p.backups],
    skipped: p.skipped.map((g) => ({ label: g.label, rels: [...g.rels] })),
    counts: {
      updated: p.counts.updated,
      restored: p.counts.restored,
      ok: p.counts.ok,
      forced: p.counts.forced,
      skipped: p.counts.skipped,
    },
    models: {
      outcome: p.models.outcome,
      label: p.models.label,
      replacedLegacyDefault: p.models.replacedLegacyDefault,
      backup: p.models.backup,
      conversion:
        p.models.conversion === null
          ? null
          : {
              changes: capAll(p.models.conversion.changes, MAX_REASON),
              leftovers: capAll(p.models.conversion.leftovers, MAX_REASON),
            },
      problems: capAll(p.models.problems, MAX_REASON),
      upstreamReasons: capAll(p.models.upstreamReasons, MAX_REASON),
    },
    hooks: {
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
    frozenCapabilities: [...p.frozenCapabilities],
    unknownCapabilities: p.unknownCapabilities.map((u) => ({
      role: u.role,
      name: cap(u.name, MAX_UNKNOWN_FIELD),
      subtree: cap(u.subtree, MAX_UNKNOWN_FIELD),
      reason: cap(u.reason, MAX_UNKNOWN_FIELD),
    })),
    recordsNote: p.recordsNote === null ? null : cap(p.recordsNote, MAX_REASON),
    ...(p.orphans.length > 0
      ? {
          orphans: p.orphans.map((o) => ({
            path: o.path,
            state: o.state,
            ...(o.reason !== undefined
              ? { reason: cap(o.reason, MAX_REASON) }
              : {}),
          })),
        }
      : {}),
  };
}

export function buildUpdateReport(input: UpdateReportInput): UpdateReport {
  const { plan } = input;
  const compact = input.compact ?? false;
  return {
    schemaVersion: UPDATE_SCHEMA_VERSION,
    command: 'update',
    dryRun: true,
    ...(compact ? { compact: true as const } : {}),
    status: input.status,
    force: input.force,
    channel: input.channel,
    channelChange:
      input.channel === input.currentChannel
        ? null
        : { from: input.currentChannel, to: input.channel },
    source: {
      kind: input.source.kind,
      tag: input.source.kind === 'release' ? input.source.tag : null,
    },
    version: {
      installed: input.installed,
      latest: plan ? plan.installedVersion : input.latest,
      recorded: plan ? plan.recordedVersion : null,
      withheld: plan ? plan.versionWithheld : null,
      pending: plan ? plan.pendingSkillsVersion : null,
    },
    archetypes: [...input.archetypes],
    plan: plan ? planReport(plan, compact) : null,
  };
}
