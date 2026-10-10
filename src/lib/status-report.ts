import type { InstallDiff } from './diff.js';
import { hookWiringFails } from './hook-wiring.js';
import type { HookEntry, HookWiringDiff } from './hook-wiring.js';
import { resolveStageRows, type StageRow } from './model-config-format.js';
import { checkModelsBlock, type ModelsRed } from './model-config.js';
import { needsModelsConversion } from './models-update.js';
import { NODE_FLOOR, type NodeFloorStatus } from './node-floor.js';
import type { InstallSource, RefChoice } from './release.js';
import { cap, serializeJsonReport } from './json-report.js';
import { versionStatus } from './version-status.js';
import type { PharnConfig, UnknownCapability } from '../types.js';

// ---------------------------------------------------------------------------
// The `pharn status --json` report: ONE pure object built from values the
// command already computed, and ONE serializer. No I/O, no clack, no exit — so
// the text notes and the JSON cannot disagree about a value, and the stdout
// contract (exactly one object, nothing else) has a single place to live.
//
// `schemaVersion` is matched exactly by a consumer (P5): additive keys may
// arrive within 1; a breaking change bumps it. That stability is a documented
// contract (advisory), not something the floor enforces.
//
// Trust (P2): every free-text field here — paths, reasons, hook commands,
// capability names, the models block's own words, the release tag — is
// UNTRUSTED DATA. It is serialized as a JSON string, never interpreted, and
// `serializeStatusReport` escapes everything a terminal would interpret. Enum-
// like fields (`status`, `verdict`, `kind`, `channel`) come from this file's own
// membership tests, never from input.
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
    source: { kind: InstallSource['kind']; tag: string | null };
    ahead: boolean;
    outdated: boolean;
  };
  archetypes: string[];
  capabilities: { count: number };
  // null when the drift check was skipped (`--no-drift`): not computed.
  drift: {
    modified: string[];
    missing: string[];
    unreadable: { rel: string; reason: string }[];
    okCount: number;
  } | null;
  hooks: {
    status: HookWiringDiff['status'];
    missing: HookEntry[];
    localOnly: HookEntry[];
    file: string | null;
    reason: string | null;
  } | null;
  // null when the config carries no `models` block.
  models: {
    conversionNeeded: boolean;
    verdict: 'valid' | 'no-stages' | 'invalid' | 'old-format';
    stages: StageRow[] | null;
    reds: { kind: ModelsRed['kind']; detail: string }[] | null;
  } | null;
  unknownCapabilities:
    { role: string; name: string; subtree: string; reason: string }[] | null;
  strict: { enabled: boolean; failed: boolean };
}

/** What the command computed; `drift` is null under `--no-drift`. */
export interface StatusReportInput {
  node: NodeFloorStatus;
  config: PharnConfig;
  channel: RefChoice;
  latest: string;
  source: InstallSource;
  drift: {
    diff: InstallDiff;
    hooks: HookWiringDiff;
    unknown: readonly UnknownCapability[];
  } | null;
  strict: boolean;
}

/**
 * Would `--strict` exit 1? THE one predicate, used by the text path and the
 * JSON path alike so the two cannot diverge. Under `--no-drift` only the
 * version can fail (nothing else was computed).
 */
export function strictFails(input: {
  outdated: boolean;
  diff?: InstallDiff;
  hooks?: HookWiringDiff;
}): boolean {
  const { outdated, diff, hooks } = input;
  return (
    outdated ||
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
  if (needsModelsConversion(models)) {
    return {
      conversionNeeded: true,
      verdict: 'old-format',
      stages: null,
      reds: null,
    };
  }
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
  const { ahead, outdated } = versionStatus({
    installed: config.skillsVersion,
    latest: input.latest,
    source: input.source,
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
    drift:
      drift === null
        ? null
        : {
            modified: drift.diff.modified,
            missing: drift.diff.missing,
            unreadable: drift.diff.unreadable,
            okCount: drift.diff.okCount,
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
    strict: {
      enabled: input.strict,
      failed:
        input.strict &&
        strictFails({
          outdated,
          diff: drift?.diff,
          hooks: drift?.hooks,
        }),
    },
  };
}

/**
 * The report as the text written to stdout: `serializeJsonReport` (lib/
 * json-report.ts), the one serializer every `--json` report goes through.
 */
export function serializeStatusReport(report: StatusReport): string {
  return serializeJsonReport(report);
}
