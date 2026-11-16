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

// The project state a `pharn update` run would leave behind — the record store
// and the config — as PURE values, and the ONE "changes nothing" predicate
// (CORE-162) that the real run, the dry run and `--dry-run --json` all read.
//
// The writer (src/commands/update.ts → applyPlannedUpdate) builds what it
// writes through `nextRecordStore` / `nextConfig`, and the planner
// (lib/update-plan.ts) compares the same two values with what the run LOADED,
// so "would this run change pharn.config.json?" is answered by the code that
// would write it, not by a second description of it. No I/O here.

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
      // Orphans keep their record while their file exists, so later runs (and
      // `status`) still name them. Disjoint from the manifest by construction.
      // A root doc the run retired is gone, so its record goes with it.
      ...orphanRecords,
      ...apply.plan.nextRecords,
      ...extra.written,
      // `planUpdate` keys its records by the manifest, which holds no models
      // block, so the block's record is added here.
      ...(apply.models.nextRecord !== null
        ? { [MODELS_RECORD_KEY]: apply.models.nextRecord }
        : {}),
    },
  };
}

/**
 * The config a run writes. `stamp` carries the two fields that describe the
 * WRITE rather than the install — the CLI that wrote it and when — which is
 * why the predicate below leaves them out.
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
    // The channel this run used — even when the version bump is withheld: it is
    // the user's choice of source, not a claim about the bytes.
    ...(channel === 'latest' ? { ref: 'latest' as const } : {}),
    ...(report.pendingSkillsVersion !== null
      ? { pendingSkillsVersion: report.pendingSkillsVersion }
      : {}),
    ...(apply.frozenKeys.length > 0
      ? { frozenCapabilities: apply.frozenKeys }
      : {}),
    capabilities: apply.configCapabilities,
    layout: report.layout,
    // `installedAt` rides the spread: it is the first install's date, not this
    // run's. The time of this rewrite goes in `updatedAt`.
    updatedAt: stamp.updatedAt,
    // In place: the key keeps its position in the file, and `undefined` (there
    // was none and there is none to write) writes no key.
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

// A config as the READER sees it (lib/pharn-config.ts → readPharnConfig and the
// helpers every command resolves it through), minus the two fields that
// describe a write rather than the install. Applied to the loaded config AND
// the next one alike — one function, never a written-side special case — so a
// difference that only load-time resolution produces never counts as a change:
// - `layout`: an absent or unknown value IS `configLayout`'s answer (flat);
// - `ref`: only the literal "latest" means anything (`channelOf`);
// - `commit`: absent and `null` both mean "no commit recorded" (the reader
//   already loads an absent one as `null`, CORE-160; kept so the comparison
//   never depends on that).
// `seam` needs no step: the loaded config already holds the validated,
// stripped block, and the next config spreads it unchanged.
// A real value change (the clone's layout differs from the resolved recorded
// one, a channel switch, a new commit) still differs after resolution.
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
 * PARSED values (key order never counts) against what the run LOADED — the
 * config `loadArchetypeConfigOrExit` returned and the store `readRecords` read.
 * An absent or invalid store is always a change: the run writes one.
 *
 * Only meaningful for a plan that writes no file and retires no root doc —
 * the next store is then a pure value of the plan (nothing to hash at the
 * dest), which is exactly when `changesNothing` consults it.
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
 * Everything but the two state files: the run writes no file, deletes no
 * capability directory and no root doc, moves no user data, and adds nothing
 * to `.gitignore` or `.prettierignore`. The dry run also reads it alone, to
 * say when the state files are ALL a run would change.
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
    // User-data moves (lib/root-migration.ts) — one clause, so it goes in one
    // deletion when the migration stops moving data.
    !(report.rootMigration?.moves ?? []).some((m) => m.action === 'move') &&
    !gitignorePending(report.gitignore) &&
    !prettierignorePending(report.prettierignore)
  );
}

/**
 * THE "changes nothing" predicate (CORE-162): `changesNoFiles`, and the record
 * store and every config field but `updatedAt`/`pharnVersion` stay as they
 * are. A conjunction of membership tests over the plan (P5).
 */
export function changesNothing(
  report: Parameters<typeof changesNoFiles>[0],
  state: StateChanges,
): boolean {
  return changesNoFiles(report) && !state.config && !state.records;
}
