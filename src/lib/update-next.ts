import { isDeepStrictEqual } from 'node:util';
import { gitignorePending } from './gitignore.js';
import {
  MODELS_RECORD_KEY,
  RECORDS_SCHEMA_VERSION,
  type FileRecords,
  type ReadRecordsResult,
} from './install-records.js';
import { configLayout } from './layout.js';
import { prettierignorePending } from './prettierignore.js';
import { channelOf, type RefChoice } from './release.js';
import type { UpdateApplyInputs, UpdatePlanReport } from './update-plan.js';
import type { PharnConfig } from '../types.js';

// The project state a `pharn update` run would leave behind — record store and
// config — as PURE values, and the ONE "changes nothing" predicate every update
// path reads. The writer writes through `nextRecordStore` / `nextConfig` and the
// planner compares the same values with what the run LOADED, so the question is
// answered by the code that would write. No I/O here.

/** What `writeRecords` is handed: the stamp and every file record. */
export interface NextRecordStore {
  skillsVersion: string;
  commit: string | null;
  files: FileRecords;
}

/**
 * The record store a run writes. `written` is the dest hashes of the files the
 * run wrote (empty before any write), `retired` the root docs it deleted —
 * their records go with them.
 */
export function nextRecordStore(
  apply: Pick<
    UpdateApplyInputs,
    | 'frozenRecords'
    | 'orphanRecords'
    | 'settingsRecords'
    | 'plan'
    | 'models'
    | 'nextSkillsVersion'
    | 'nextCommit'
  >,
  extra: { written: FileRecords; retired: ReadonlySet<string> },
): NextRecordStore {
  const orphanRecords = Object.fromEntries(
    Object.entries(apply.orphanRecords).filter(
      ([rel]) => !extra.retired.has(rel),
    ),
  );
  return {
    skillsVersion: apply.nextSkillsVersion,
    commit: apply.nextCommit,
    files: {
      ...apply.frozenRecords,
      // Orphans keep their record while their file exists; a retired root
      // doc's record goes with it.
      ...orphanRecords,
      // The settings.json init wrote: outside the manifest, carried only while
      // the file is there.
      ...apply.settingsRecords,
      ...apply.plan.nextRecords,
      ...extra.written,
      // The manifest holds no models block, so its record is added here.
      ...(apply.models.nextRecord !== null
        ? { [MODELS_RECORD_KEY]: apply.models.nextRecord }
        : {}),
    },
  };
}

/**
 * The config a run writes. `stamp` carries the two fields that describe the
 * WRITE rather than the install, which the predicate below leaves out.
 */
export function nextConfig(
  config: PharnConfig,
  report: Pick<UpdatePlanReport, 'pendingSkillsVersion' | 'layout'>,
  apply: Pick<
    UpdateApplyInputs,
    | 'nextSkillsVersion'
    | 'nextCommit'
    | 'frozenKeys'
    | 'configCapabilities'
    | 'models'
  >,
  channel: RefChoice,
  stamp: { pharnVersion: string; updatedAt: string },
): PharnConfig {
  const {
    pendingSkillsVersion: _previousPending,
    frozenCapabilities: _previousFrozen,
    ref: _previousRef,
    ...rest
  } = config;
  return {
    ...rest,
    // The CLI that wrote this install state, as `init` records it.
    pharnVersion: stamp.pharnVersion,
    skillsVersion: apply.nextSkillsVersion,
    commit: apply.nextCommit,
    // Recorded even when the bump is withheld: a choice of source, not a claim
    // about the bytes.
    ...(channel === 'latest' ? { ref: 'latest' as const } : {}),
    ...(report.pendingSkillsVersion !== null
      ? { pendingSkillsVersion: report.pendingSkillsVersion }
      : {}),
    ...(apply.frozenKeys.length > 0
      ? { frozenCapabilities: apply.frozenKeys }
      : {}),
    capabilities: apply.configCapabilities,
    layout: report.layout,
    // `installedAt` (the first install's date) rides the spread.
    updatedAt: stamp.updatedAt,
    // In place, keeping the key's position; `undefined` writes no key.
    models: apply.models.next,
  };
}

/** Which of the two state files a run would change. */
export interface StateChanges {
  config: boolean;
  records: boolean;
}

// A value as JSON holds it: `undefined`-valued keys gone, everything else a
// plain object/array/primitive — so the comparison is the one the file sees.
function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

// A config as the READER resolves it, minus the two write-describing fields.
// Applied to the loaded AND the next config alike, so a difference only
// load-time resolution produces never counts as a change: `layout` →
// `configLayout`, `ref` → "latest" or nothing (`channelOf`), `commit` → `null`
// when absent. A real change (new layout, channel switch, new commit) still
// differs.
function loadResolved(config: PharnConfig): unknown {
  const {
    updatedAt: _updatedAt,
    pharnVersion: _pharnVersion,
    layout: _layout,
    ref: _ref,
    commit: _commit,
    ...rest
  } = config;
  return jsonValue({
    ...rest,
    layout: configLayout(config),
    commit: config.commit ?? null,
    ...(channelOf(config) === 'latest' ? { ref: 'latest' } : {}),
  });
}

/**
 * Would the run change `pharn.config.json` or `pharn.records.json`? Compared as
 * PARSED values against what the run LOADED; an absent or invalid store is
 * always a change. Meaningful only for a plan that writes no file (the next
 * store is then a pure value), which is when `changesNothing` consults it.
 */
export function planStateChanges(input: {
  config: PharnConfig;
  report: Pick<UpdatePlanReport, 'pendingSkillsVersion' | 'layout'>;
  apply: Parameters<typeof nextRecordStore>[0] &
    Parameters<typeof nextConfig>[2];
  channel: RefChoice;
  loadedRecords: ReadRecordsResult;
}): StateChanges {
  const { config, report, apply, channel, loadedRecords } = input;
  const next = nextConfig(config, report, apply, channel, {
    pharnVersion: '',
    updatedAt: '',
  });
  const store = {
    schemaVersion: RECORDS_SCHEMA_VERSION,
    ...nextRecordStore(apply, { written: {}, retired: new Set() }),
  };
  return {
    config: !isDeepStrictEqual(loadResolved(next), loadResolved(config)),
    records:
      loadedRecords.kind !== 'ok' ||
      !isDeepStrictEqual(jsonValue(store), jsonValue(loadedRecords.store)),
  };
}

/**
 * Everything but the two state files: no file written, no capability directory
 * or root doc deleted, nothing added to `.gitignore` / `.prettierignore` (a
 * user-data hint changes nothing). The dry run also reads it alone.
 */
export function changesNoFiles(
  report: Pick<
    UpdatePlanReport,
    'writes' | 'removals' | 'rootMigration' | 'gitignore' | 'prettierignore'
  >,
): boolean {
  return (
    report.writes.length === 0 &&
    !report.removals.some((r) => r.present) &&
    !(report.rootMigration?.docs ?? []).some((d) => d.action === 'delete') &&
    !gitignorePending(report.gitignore) &&
    !prettierignorePending(report.prettierignore)
  );
}

/**
 * THE "changes nothing" predicate: `changesNoFiles`, and the record store and
 * every config field but `updatedAt`/`pharnVersion` stay as they are.
 */
export function changesNothing(
  report: Parameters<typeof changesNoFiles>[0],
  state: StateChanges,
): boolean {
  return changesNoFiles(report) && !state.config && !state.records;
}
