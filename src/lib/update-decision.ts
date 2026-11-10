import type { FileRecords } from './install-records.js';

// ---------------------------------------------------------------------------
// The update decision — the ONE axis of `pharn update`'s drift safety, and a
// pure function: no I/O, no clock, no fs. Given what is on disk, what upstream
// ships, and what pharn recorded writing, decide whether a file may be
// overwritten. The whole guarantee of the feature reduces to the table below.
//
// FLOOR (P0, ARCHITECTURE.md §2 #2 — content-hash): "differs from what pharn
// recorded writing" is a sha256 equality, not a judgment. Every branch here is
// an equality or a presence test (P5); the terminal fallback for "cannot prove
// this file is pristine" is SKIP + a named label in the report — it ends in
// TELLING THE HUMAN, never in a guess and never in a silent overwrite.
//
// The honest limit: this guarantees update does not overwrite an unproven file
// WITHOUT `--force`. `--force` is the human's explicit answer to the report, and
// it overwrites every skip bucket — after the caller has backed each file up.
// ---------------------------------------------------------------------------

export type UpdateAction = 'write' | 'noop' | 'skip';

/**
 * Why a file got its action. `restored`/`updated`/`ok` are outcomes of a healthy
 * upgrade; `modified`/`unrecorded`/`unverifiable` are the three reasons a file
 * could not be proven pristine (the SKIP buckets, which `--force` overrides).
 */
export type UpdateLabel =
  'restored' | 'updated' | 'ok' | 'modified' | 'unrecorded' | 'unverifiable';

export interface FileDecisionInput {
  // sha256 of the file in the project, or null when it is absent.
  diskHash: string | null;
  // sha256 of the file in the freshly-fetched clone.
  latestHash: string;
  // sha256 pharn recorded writing there, or null when there is no entry.
  recordedHash: string | null;
  // False for a pre-record install, or a store that failed validation / its
  // stamp check — the fail-closed state.
  recordsAvailable: boolean;
  force: boolean;
}

export interface FileDecision {
  action: UpdateAction;
  label: UpdateLabel;
  // True only when `force` converted a SKIP into a write — i.e. exactly the
  // files whose current bytes must be backed up before they are destroyed.
  backup: boolean;
  // True when the file's record should become `latestHash` after the run.
  refreshRecord: boolean;
  // True when this write only happened because of `--force`.
  forced: boolean;
}

/**
 * The decision table (first match wins):
 *
 * | # | disk    | records     | condition                 | default        | --force      |
 * |---|---------|-------------|---------------------------|----------------|--------------|
 * | 1 | missing | any         | —                         | WRITE restored | WRITE        |
 * | 2 | present | any         | disk == latest            | NO-OP ok       | NO-OP        |
 * | 3 | present | available   | disk == recorded          | WRITE updated  | WRITE        |
 * | 4 | present | available   | recorded exists, disk !=  | SKIP modified  | backup→WRITE |
 * | 5 | present | available   | no record for this path   | SKIP unrecorded| backup→WRITE |
 * | 6 | present | unavailable | —                         | SKIP unverif.  | backup→WRITE |
 *
 * Row 2 deliberately precedes the record rows: a file already identical by `contentHash` to
 * upstream is never a skip — even with no records — and its record is refreshed,
 * which is how a degraded install partially heals. (Partially: it never recovers
 * records for the files that DIFFER, which is exactly the set an upgrade needs
 * to touch. Those stay skipped until `--force` or a manual revert.)
 */
export function decideFileAction(input: FileDecisionInput): FileDecision {
  const { diskHash, latestHash, recordedHash, recordsAvailable, force } = input;

  // Row 1 — nothing on disk to destroy, so restoring is always safe.
  if (diskHash === null) {
    return {
      action: 'write',
      label: 'restored',
      backup: false,
      refreshRecord: true,
      forced: false,
    };
  }

  // Row 2 — already the upstream bytes: nothing to do, and the record is
  // refreshed so a missing/stale entry self-corrects.
  if (diskHash === latestHash) {
    return {
      action: 'noop',
      label: 'ok',
      backup: false,
      refreshRecord: true,
      forced: false,
    };
  }

  // Rows 3-5 need a trustworthy baseline; without one every difference is
  // unexplainable (row 6).
  if (!recordsAvailable) return skipOrForce('unverifiable', force);
  if (recordedHash === null) return skipOrForce('unrecorded', force);

  // Row 3 — disk is exactly what pharn last wrote: a clean upgrade.
  if (diskHash === recordedHash) {
    return {
      action: 'write',
      label: 'updated',
      backup: false,
      refreshRecord: true,
      forced: false,
    };
  }

  // Row 4 — disk is neither upstream's nor ours: the user changed it.
  return skipOrForce('modified', force);
}

// The three SKIP buckets share one shape: skip by default, and under --force
// become a backed-up overwrite. Keeping it in one place means the buckets can
// never drift apart in their force behavior.
function skipOrForce(label: UpdateLabel, force: boolean): FileDecision {
  if (!force) {
    return {
      action: 'skip',
      label,
      backup: false,
      refreshRecord: false,
      forced: false,
    };
  }
  return {
    action: 'write',
    label,
    backup: true,
    refreshRecord: true,
    forced: true,
  };
}

// ---------------------------------------------------------------------------
// The whole-run planner (also pure): the same decision applied across the
// install manifest, plus the derived write set, backup set, skip groups and the
// NEXT record map.
// ---------------------------------------------------------------------------

/**
 * Why a planned file was not written: a decision-table SKIP label, the
 * `unreadable` terminal below, or `held` — a write the executable-unit pass
 * withheld because a sibling in the unit was skipped (see `planUpdate`).
 */
export type SkipLabel = UpdateLabel | 'unreadable' | 'held';

/**
 * What the project holds at an expected path. `unreadable` is the deterministic
 * terminal for a path that exists but cannot be hashed (a directory where a file
 * is expected, an EACCES file): it is reported by name and skipped, never
 * crashing the run and never silently overwritten (P5).
 */
export type DiskState =
  | { kind: 'absent' }
  | { kind: 'file'; hash: string }
  | { kind: 'unreadable'; reason: string };

export interface PlannedFile {
  rel: string;
  action: UpdateAction;
  // The skip/outcome label, widened by the `unreadable` terminal and `held`.
  label: SkipLabel;
  backup: boolean;
  forced: boolean;
}

export interface UpdatePlan {
  files: PlannedFile[];
  // rel paths to copy from the clone, in manifest order.
  writes: string[];
  // rel paths whose current bytes must be backed up BEFORE any write.
  backups: string[];
  // Skipped files grouped by why, for the report.
  skipped: { label: SkipLabel; rels: string[] }[];
  counts: {
    updated: number;
    restored: number;
    ok: number;
    forced: number;
    skipped: number;
  };
  // The record map to persist for a COMPLETE run: keyed by the manifest just
  // applied, so entries for paths no longer installed are pruned rather than
  // accumulating forever. Skipped files carry their previous entry forward.
  nextRecords: FileRecords;
  // The executable-unit hold, or null when none happened: the unit files that
  // were skipped (the blockers, with their labels) and the unit writes that
  // were withheld because of them.
  held: UnitHold | null;
}

export interface UnitHold {
  blocking: { rel: string; label: SkipLabel }[];
  held: string[];
}

// The order skip groups are reported in — most actionable first (P5:
// deterministic output, never dependent on map iteration order).
const SKIP_ORDER: SkipLabel[] = [
  'modified',
  'unrecorded',
  'unverifiable',
  'unreadable',
  'held',
];

export function planUpdate(params: {
  // rel → sha256 of the clone's copy (the install manifest, hashed).
  latestHashes: Map<string, string>;
  // rel → what the project holds there.
  diskStates: Map<string, DiskState>;
  // The validated baseline, or null when records are unavailable.
  records: FileRecords | null;
  force: boolean;
  // The executable unit (lib/executable-unit.ts): membership by path. When set
  // together with `holdUnit`, the unit is written all-or-nothing.
  unit?: (rel: string) => boolean;
  // True when the run moves the installed version. At the same version a
  // write puts back same-version bytes, so no mix is possible and nothing is
  // held — which also keeps a same-version re-open able to restore a deleted
  // file (it would otherwise re-open every run without progress).
  holdUnit?: boolean;
}): UpdatePlan {
  const { latestHashes, diskStates, records, force, unit, holdUnit } = params;
  const files: PlannedFile[] = [];
  const writes: string[] = [];
  const backups: string[] = [];
  const nextRecords: FileRecords = {};
  const groups = new Map<SkipLabel, string[]>();
  const counts = { updated: 0, restored: 0, ok: 0, forced: 0, skipped: 0 };

  for (const [rel, latestHash] of latestHashes) {
    const disk = diskStates.get(rel) ?? { kind: 'absent' };
    const previous = records?.[rel];

    // An unhashable destination never reaches the decision table — there is no
    // `diskHash` to compare, and guessing one would be exactly the classification
    // P5 forbids.
    if (disk.kind === 'unreadable') {
      files.push({
        rel,
        action: 'skip',
        label: 'unreadable',
        backup: false,
        forced: false,
      });
      pushGroup(groups, 'unreadable', rel);
      counts.skipped += 1;
      if (previous !== undefined) nextRecords[rel] = previous;
      continue;
    }

    const decision = decideFileAction({
      diskHash: disk.kind === 'file' ? disk.hash : null,
      latestHash,
      recordedHash: previous ?? null,
      recordsAvailable: records !== null,
      force,
    });

    files.push({
      rel,
      action: decision.action,
      label: decision.label,
      backup: decision.backup,
      forced: decision.forced,
    });

    if (decision.action === 'write') {
      writes.push(rel);
      if (decision.backup) backups.push(rel);
      if (decision.forced) counts.forced += 1;
      else if (decision.label === 'restored') counts.restored += 1;
      else counts.updated += 1;
    } else if (decision.action === 'noop') {
      counts.ok += 1;
    } else {
      pushGroup(groups, decision.label, rel);
      counts.skipped += 1;
    }

    // Written or confirmed-identical → the record becomes the upstream hash.
    // Skipped → carry the previous entry forward (or stay absent).
    if (decision.refreshRecord) nextRecords[rel] = latestHash;
    else if (previous !== undefined) nextRecords[rel] = previous;
  }

  // The executable-unit hold (P5: label membership + a path predicate). Never
  // under --force: there every skip became a backed-up write, so the unit is
  // written whole. Otherwise, one skipped unit file withholds EVERY unit write,
  // so the unit stays at the old version rather than becoming a mix. A row-2
  // file already identical to upstream is left as it is: nothing is written.
  const held =
    force || !holdUnit || !unit
      ? null
      : holdUnitWrites({
          files,
          writes,
          groups,
          counts,
          unit,
          records,
          nextRecords,
        });

  const skipped = SKIP_ORDER.filter((label) => groups.has(label)).map(
    (label) => ({ label, rels: groups.get(label)!.slice().sort() }),
  );

  return { files, writes, backups, skipped, counts, nextRecords, held };
}

// Turn every unit write into a `held` skip when any unit file was skipped.
// Mutates the planner's own accumulators in place; returns the hold or null.
function holdUnitWrites(acc: {
  files: PlannedFile[];
  writes: string[];
  groups: Map<SkipLabel, string[]>;
  counts: UpdatePlan['counts'];
  unit: (rel: string) => boolean;
  records: FileRecords | null;
  nextRecords: FileRecords;
}): UnitHold | null {
  const { files, writes, groups, counts, unit, records, nextRecords } = acc;
  const blocking = files
    .filter((f) => f.action === 'skip' && unit(f.rel))
    .map((f) => ({ rel: f.rel, label: f.label }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  if (blocking.length === 0) return null;
  const heldRels: string[] = [];
  for (const file of files) {
    if (file.action !== 'write' || !unit(file.rel)) continue;
    // Not forced (force never reaches here), so a write is `restored` or
    // `updated`: take it back out of the counts it went into.
    if (file.label === 'restored') counts.restored -= 1;
    else counts.updated -= 1;
    counts.skipped += 1;
    file.action = 'skip';
    file.label = 'held';
    heldRels.push(file.rel);
    pushGroup(groups, 'held', file.rel);
    // Nothing was written, so the previous record (if any) stays true.
    const previous = records?.[file.rel];
    if (previous !== undefined) nextRecords[file.rel] = previous;
    else delete nextRecords[file.rel];
  }
  if (heldRels.length === 0) return null;
  const heldSet = new Set(heldRels);
  for (let i = writes.length - 1; i >= 0; i -= 1)
    if (heldSet.has(writes[i]!)) writes.splice(i, 1);
  return { blocking, held: heldRels.slice().sort() };
}

function pushGroup(
  groups: Map<SkipLabel, string[]>,
  label: SkipLabel,
  rel: string,
): void {
  const existing = groups.get(label);
  if (existing) existing.push(rel);
  else groups.set(label, [rel]);
}
