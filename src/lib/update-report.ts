import type { RootDocAction } from './root-migration.js';
import type {
  HookEntry,
  HookReplacement,
  HookWiringDiff,
} from './hook-wiring.js';
import { cap } from './json-report.js';
import type { CapabilityChange } from './merge-capabilities.js';
import type { ModelsOutcome } from './models-update.js';
import type { InstallSource, RefChoice } from './release.js';
import type {
  PlannedFile,
  SkipLabel,
  UpdateLabel,
  UpdatePlan,
} from './update-decision.js';
import type { CapabilityRemoval, UpdatePlanReport } from './update-plan.js';
import type { OrphanState } from './orphans.js';
import {
  gitignoreReport,
  type GitignorePlan,
  type GitignoreReport,
} from './gitignore.js';
import {
  prettierignoreReport,
  type PrettierignorePlan,
  type PrettierignoreReport,
} from './prettierignore.js';
import type { InstallSurface } from './install-manifest.js';
import type { Layout } from '../types.js';

// ---------------------------------------------------------------------------
// The `pharn update --dry-run --json` report: ONE pure object built from what
// the command already computed, serialized once by `serializeJsonReport`, so
// the text notes and the JSON cannot disagree about a value.
//
// An EXPLICIT field-by-field projection, never a spread, so a field added to
// `UpdatePlanReport` does not become public contract by accident. `models`
// omits the block itself and its record hash. `schemaVersion` versions
// independently of `status --json`'s: additive keys within 1, a breaking change
// bumps it (a documented contract, not enforced).
//
// Every free-text field is UNTRUSTED DATA — capped here, escaped by
// `serializeJsonReport`. Enum-like fields come from this CLI's own membership
// tests. Optional keys below are present ONLY when non-empty (or when their
// flag is passed), so a report without them keeps its earlier bytes.
// ---------------------------------------------------------------------------

export const UPDATE_SCHEMA_VERSION = 1;

// Same caps the text surfaces and `status --json` apply to the same fields.
const MAX_REASON = 300;
const MAX_UNKNOWN_FIELD = 200;

// `up-to-date`: the plan changes nothing (lib/update-next.ts `changesNothing`),
// so a real run would ask nothing and write nothing. `ahead-of-release` /
// `ahead-of-main`: the install is newer than its source, and a real run would
// change nothing without `--force`.
export type UpdateStatus =
  'planned' | 'up-to-date' | 'ahead-of-release' | 'ahead-of-main';

export interface UpdateReport {
  schemaVersion: typeof UPDATE_SCHEMA_VERSION;
  command: 'update';
  dryRun: true;
  // `true` ONLY under `--compact`: `plan.files` may then be filtered (see
  // `plan.filesOmitted`).
  compact?: true;
  // `planned` ⇒ `plan` is set; every other status ⇒ `plan` is null.
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
    // The old ROOT footprint this run would retire (lib/root-migration.ts).
    // ALWAYS present, `null` when nothing applies. `moves` is ALWAYS `[]`: user
    // data is never moved (its hint is text-only), and removing the key would
    // not be additive under schemaVersion 1.
    rootMigration: {
      docs: { rel: string; action: RootDocAction }[];
      moves: [];
      scratchNotice: boolean;
      gitignoreHints: string[];
    } | null;
    capabilities: {
      count: number;
      changes: {
        role: CapabilityChange['cap']['role'];
        name: string;
        source: 'auto' | 'manual' | null;
        reason: CapabilityChange['reason'];
      }[];
      // The capability directories a real run would DELETE (one per entry it
      // drops) and the files it would back up first. Read it as `?? []`.
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
    // ONLY under `--compact`: what `files` leaves out. `count` equals
    // `counts.ok`, so `files.length + count` is the installed-file total.
    filesOmitted?: { action: 'noop'; count: number };
    writes: string[];
    backups: string[];
    skipped: { label: SkipLabel; rels: string[] }[];
    counts: UpdatePlan['counts'];
    // The executable-unit hold (lib/executable-unit.ts): the unit files a real
    // run would skip and the unit writes it would withhold because of them
    // (`held` is then also a `label` in `files` and `skipped`). `missing`: held
    // files not on disk until the hold ends.
    executableUnit?: {
      blocking: { rel: string; label: SkipLabel }[];
      held: string[];
      missing?: string[];
    };
    models: {
      outcome: ModelsOutcome;
      label: UpdateLabel | null;
      // Constants kept for `schemaVersion` 1: pharn no longer converts the
      // pre-0.7.0 format (0.19.x was the last CLI that did), so these are
      // always `false` and `null`. Removed only with a `schemaVersion` bump.
      replacedLegacyDefault: false;
      backup: boolean;
      conversion: null;
      problems: string[];
      upstreamReasons: string[];
    };
    hooks: {
      status: HookWiringDiff['status'];
      missing: HookEntry[];
      localOnly: HookEntry[];
      file: string | null;
      reason: string | null;
      // Missing hooks the project already wires in another spelling (same
      // script, event and matcher) — replace, not add.
      replace?: HookReplacement[];
    };
    // The declared product surfaces the clone ships no file for.
    absentUpstream?: { surface: InstallSurface; path: string }[];
    frozenCapabilities: string[];
    unknownCapabilities: {
      role: string;
      name: string;
      subtree: string;
      reason: string;
    }[];
    recordsNote: string | null;
    // Recorded files upstream no longer ships, still on disk (lib/orphans.ts);
    // never filtered by `--compact`.
    orphans?: { path: string; state: OrphanState; reason?: string }[];
    // What a real run would add to `.gitignore` (or why it would not).
    gitignore?: GitignoreReport;
    // What a real run would add to `.prettierignore` (or why it would not).
    prettierignore?: PrettierignoreReport;
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
  // The planner's report; null unless `status` is `planned`.
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
  // Membership on the action enum; `counts` is never filtered.
  const kept = compact ? p.files.filter((f) => f.action !== 'noop') : p.files;
  return {
    layout: p.layout,
    abandonedLayout: p.abandonedLayout,
    featuresReadmeRelocation: p.featuresReadmeRelocation,
    rootMigration:
      p.rootMigration === null
        ? null
        : {
            docs: p.rootMigration.docs.map((d) => ({
              rel: d.rel,
              action: d.action,
            })),
            moves: [],
            scratchNotice: p.rootMigration.scratchNotice,
            gitignoreHints: [...p.rootMigration.gitignoreHints],
          },
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
    // The `--force` casualties (and the config); a dropped capability's
    // backups are listed by its removal.
    backups: [...new Set(p.backups)],
    skipped: p.skipped.map((g) => ({ label: g.label, rels: [...g.rels] })),
    counts: {
      updated: p.counts.updated,
      restored: p.counts.restored,
      ok: p.counts.ok,
      forced: p.counts.forced,
      skipped: p.counts.skipped,
    },
    ...(p.executableUnit !== null
      ? {
          executableUnit: {
            blocking: p.executableUnit.blocking.map((b) => ({
              rel: b.rel,
              label: b.label,
            })),
            held: [...p.executableUnit.held],
            ...((p.executableUnit.missing ?? []).length > 0
              ? { missing: [...p.executableUnit.missing!] }
              : {}),
          },
        }
      : {}),
    models: {
      outcome: p.models.outcome,
      label: p.models.label,
      replacedLegacyDefault: false,
      backup: p.models.backup,
      conversion: null,
      problems: capAll(p.models.problems, MAX_REASON),
      upstreamReasons: capAll(p.models.upstreamReasons, MAX_REASON),
    },
    hooks: {
      status: p.hookWiring.status,
      missing: p.hookWiring.missing,
      localOnly: p.hookWiring.localOnly ?? [],
      file: p.hookWiring.file ?? null,
      reason: p.hookWiring.reason ?? null,
      ...(p.hookWiring.replace?.length
        ? { replace: p.hookWiring.replace }
        : {}),
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
    ...gitignoreKey(p.gitignore),
    ...prettierignoreKey(p.prettierignore),
  };
}

// `{prettierignore}` when a real run would touch `.prettierignore`, else nothing.
function prettierignoreKey(plan: PrettierignorePlan): {
  prettierignore?: PrettierignoreReport;
} {
  const report = prettierignoreReport(plan);
  return report === null ? {} : { prettierignore: report };
}

// `{gitignore}` when a real run would touch `.gitignore`, else nothing.
function gitignoreKey(plan: GitignorePlan): { gitignore?: GitignoreReport } {
  const report = gitignoreReport(plan);
  return report === null ? {} : { gitignore: report };
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
