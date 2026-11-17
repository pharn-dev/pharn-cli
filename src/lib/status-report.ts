import type { InstallDiff } from './diff.js';
import { hookWiringFails } from './hook-wiring.js';
import type {
  HookEntry,
  HookReplacement,
  HookWiringDiff,
} from './hook-wiring.js';
import { resolveStageRows, type StageRow } from './model-config-format.js';
import { checkModelsBlock, type ModelsRed } from './model-config.js';
import { NODE_FLOOR, type NodeFloorStatus } from './node-floor.js';
import type { RefChoice, SourceSummary } from './release.js';
import { cap, serializeJsonReport } from './json-report.js';
import { versionStatus } from './version-status.js';
import type { AbsentSurface, InstallSurface } from './install-manifest.js';
import {
  prettierignoreReport,
  type PrettierignorePlan,
  type PrettierignoreReport,
} from './prettierignore.js';
import type { Orphan, OrphanState } from './orphans.js';
import type { Layout, PharnConfig, UnknownCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The `pharn status --json` report: ONE pure object built from values the
// command already computed, and ONE serializer — so the text notes and the
// JSON cannot disagree, and "exactly one object on stdout" lives in one place.
// Additive keys may arrive within a `schemaVersion`; a breaking change bumps
// it. Every free-text field is UNTRUSTED data, serialized as a JSON string and
// escaped; enum-like fields come from this file's own membership tests.
// ---------------------------------------------------------------------------

export const STATUS_SCHEMA_VERSION = 1;

// Same caps the text surfaces apply to the same fields.
const MAX_RED_DETAIL = 300;
const MAX_UNKNOWN_FIELD = 200;
const MAX_RUNNING_NODE = 40;

export interface StatusReport {
  schemaVersion: typeof STATUS_SCHEMA_VERSION;
  node: {
    floor: string;
    running: string | null;
    status: NodeFloorStatus['kind'];
  };
  version: {
    installed: string;
    latest: string;
    channel: RefChoice;
    source: { kind: SourceSummary['kind']; tag: string | null };
    ahead: boolean;
    outdated: boolean;
  };
  archetypes: string[];
  capabilities: { count: number };
  // The recorded layout and the clone's (null under `--no-drift`). Both are
  // `pharn` whenever the command gets this far: a flat config, or a flat clone,
  // is refused first (the flat layout was removed in v0.21.0), so they never
  // differ. Kept for `schemaVersion` 1.
  layout: { recorded: Layout; upstream: Layout | null };
  // null when not computed: `--no-drift` (`layout.upstream` null too).
  drift: {
    modified: string[];
    missing: string[];
    unreadable: { rel: string; reason: string }[];
    okCount: number;
    // Declared product surfaces the clone ships no file for, at ITS layout.
    absentUpstream: { surface: InstallSurface; path: string }[];
  } | null;
  hooks: {
    status: HookWiringDiff['status'];
    missing: HookEntry[];
    localOnly: HookEntry[];
    file: string | null;
    reason: string | null;
    // Present ONLY when non-empty: missing hooks the project wires in another
    // spelling — replace, not add.
    replace?: HookReplacement[];
  } | null;
  // null when the config carries no `models` block.
  models: {
    // Constants kept for `schemaVersion` 1: pharn no longer converts the
    // pre-0.7.0 format (0.19.x was the last CLI that did), so a block in it is
    // `invalid` with its REDs, `conversionNeeded` is always `false` and the
    // verdict is never `old-format`. Removed only with a `schemaVersion` bump.
    conversionNeeded: false;
    verdict: 'valid' | 'no-stages' | 'invalid' | 'old-format';
    stages: StageRow[] | null;
    reds: { kind: ModelsRed['kind']; detail: string }[] | null;
  } | null;
  unknownCapabilities:
    { role: string; name: string; subtree: string; reason: string }[] | null;
  // Recorded files upstream no longer ships, still on disk. null under
  // `--no-drift`, or without a usable store. Never a `--strict` input.
  orphans: { path: string; state: OrphanState; reason?: string }[] | null;
  // What `pharn update` would add to `.prettierignore`, or a refusal. null
  // when there is nothing to say or no usable store. Never a `--strict` input.
  prettierignore: PrettierignoreReport | null;
  strict: { enabled: boolean; failed: boolean };
}

/** What the command computed; `drift` is null under `--no-drift`. */
export interface StatusReportInput {
  node: NodeFloorStatus;
  config: PharnConfig;
  channel: RefChoice;
  latest: string;
  // What the channel offers; under `--no-drift` on `latest`, without the tag's
  // commit.
  source: SourceSummary;
  drift: {
    hooks: HookWiringDiff;
    unknown: readonly UnknownCapability[];
    // null when they could not be determined (see StatusReport.orphans).
    orphans: readonly Orphan[] | null;
    diff: InstallDiff;
    // absentInstallSurfaces.
    absentUpstream: readonly AbsentSurface[];
  } | null;
  // null without a usable record store (see StatusReport.prettierignore).
  prettierignore: PrettierignorePlan | null;
  strict: boolean;
}

/**
 * Would `--strict` exit 1? THE one predicate for the text and JSON paths.
 * Under `--no-drift` only the version can fail.
 */
export function strictFails(input: {
  outdated: boolean;
  diff?: InstallDiff;
  hooks?: HookWiringDiff;
  // A declared surface upstream ships no file for: the install is incomplete.
  absentUpstream?: readonly AbsentSurface[];
}): boolean {
  const { outdated, diff, hooks, absentUpstream } = input;
  return (
    outdated ||
    (absentUpstream !== undefined && absentUpstream.length > 0) ||
    (diff !== undefined &&
      (diff.modified.length > 0 ||
        diff.missing.length > 0 ||
        diff.unreadable.length > 0)) ||
    // The diff's STATUS, not the note's presence: a hook wired only in
    // settings.local.json is noted, and is still wired.
    (hooks !== undefined && hookWiringFails(hooks))
  );
}

function modelsReport(models: unknown): StatusReport['models'] {
  if (models === undefined) return null;
  const check = checkModelsBlock(models);
  if (check.kind === 'invalid') {
    return {
      conversionNeeded: false,
      verdict: 'invalid',
      stages: null,
      reds: check.reds.map((r) => ({
        kind: r.kind,
        detail: cap(r.detail, MAX_RED_DETAIL),
      })),
    };
  }
  if (check.kind === 'no-stages') {
    return {
      conversionNeeded: false,
      verdict: 'no-stages',
      stages: null,
      reds: null,
    };
  }
  return {
    conversionNeeded: false,
    verdict: 'valid',
    stages: resolveStageRows(check.stages),
    reds: null,
  };
}

export function buildStatusReport(input: StatusReportInput): StatusReport {
  const { node, config, drift } = input;
  // A loaded config is at the pharn layout (loadArchetypeConfig refuses any
  // other), and so is a clone that got this far (detectLayout).
  const layout: StatusReport['layout'] = {
    recorded: 'pharn',
    upstream: drift === null ? null : 'pharn',
  };
  const { ahead, outdated } = versionStatus({
    installed: config.skillsVersion,
    latest: input.latest,
  });
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    node: {
      floor: NODE_FLOOR,
      running:
        node.kind === 'unparseable'
          ? node.raw === undefined
            ? null
            : cap(node.raw, MAX_RUNNING_NODE)
          : cap(node.current, MAX_RUNNING_NODE),
      status: node.kind,
    },
    version: {
      installed: config.skillsVersion,
      latest: input.latest,
      channel: input.channel,
      source: {
        kind: input.source.kind,
        tag: input.source.kind === 'release' ? input.source.tag : null,
      },
      ahead,
      outdated,
    },
    archetypes: config.archetypes ?? [],
    capabilities: { count: (config.capabilities ?? []).length },
    layout,
    drift:
      drift === null
        ? null
        : {
            modified: drift.diff.modified,
            missing: drift.diff.missing,
            unreadable: drift.diff.unreadable,
            okCount: drift.diff.okCount,
            absentUpstream: drift.absentUpstream.map((a) => ({
              surface: a.surface,
              path: cap(a.path, MAX_UNKNOWN_FIELD),
            })),
          },
    hooks:
      drift === null
        ? null
        : {
            status: drift.hooks.status,
            missing: drift.hooks.missing,
            localOnly: drift.hooks.localOnly ?? [],
            file: drift.hooks.file ?? null,
            reason: drift.hooks.reason ?? null,
            ...(drift.hooks.replace?.length
              ? { replace: drift.hooks.replace }
              : {}),
          },
    models: modelsReport(config.models),
    unknownCapabilities:
      drift === null
        ? null
        : drift.unknown.map((u) => ({
            role: u.role,
            name: cap(u.name, MAX_UNKNOWN_FIELD),
            subtree: cap(u.subtree, MAX_UNKNOWN_FIELD),
            reason: cap(u.reason, MAX_UNKNOWN_FIELD),
          })),
    orphans:
      drift === null || drift.orphans === null
        ? null
        : drift.orphans.map((o) => ({
            path: o.path,
            state: o.state,
            ...(o.reason !== undefined
              ? { reason: cap(o.reason, MAX_RED_DETAIL) }
              : {}),
          })),
    prettierignore:
      input.prettierignore === null
        ? null
        : prettierignoreReport(input.prettierignore),
    strict: {
      enabled: input.strict,
      failed:
        input.strict &&
        strictFails({
          outdated,
          diff: drift?.diff,
          hooks: drift?.hooks,
          absentUpstream: drift?.absentUpstream,
        }),
    },
  };
}

/** The report as the text written to stdout, via `serializeJsonReport`. */
export function serializeStatusReport(report: StatusReport): string {
  return serializeJsonReport(report);
}
