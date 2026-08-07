import { describe, expect, it } from 'vitest';
import {
  decideFileAction,
  planUpdate,
  type DiskState,
  type FileDecisionInput,
} from '../src/lib/update-decision.js';

// Distinct, recognizable hashes — the decision is pure equality, so the values
// only need to differ.
const LATEST = 'a'.repeat(64);
const RECORDED = 'b'.repeat(64);
const USER = 'c'.repeat(64);

function decide(over: Partial<FileDecisionInput>) {
  return decideFileAction({
    diskHash: USER,
    latestHash: LATEST,
    recordedHash: RECORDED,
    recordsAvailable: true,
    force: false,
    ...over,
  });
}

describe('decideFileAction — the decision table', () => {
  it('row 1: disk missing → WRITE restored (no backup — nothing to destroy)', () => {
    expect(decide({ diskHash: null })).toEqual({
      action: 'write',
      label: 'restored',
      backup: false,
      refreshRecord: true,
      forced: false,
    });
  });

  it('row 1 holds with NO records at all (a restore never needs a baseline)', () => {
    expect(
      decide({ diskHash: null, recordedHash: null, recordsAvailable: false }),
    ).toMatchObject({ action: 'write', label: 'restored' });
  });

  it('row 2: disk already equals upstream → NO-OP, and the record is refreshed', () => {
    expect(decide({ diskHash: LATEST })).toEqual({
      action: 'noop',
      label: 'ok',
      backup: false,
      refreshRecord: true,
      forced: false,
    });
  });

  it('row 2 precedes the record rows — identical-to-upstream wins even with records unavailable', () => {
    expect(
      decide({
        diskHash: LATEST,
        recordedHash: null,
        recordsAvailable: false,
      }),
    ).toMatchObject({ action: 'noop', label: 'ok', refreshRecord: true });
  });

  it('row 3: disk equals what pharn recorded writing → WRITE updated (clean upgrade)', () => {
    expect(decide({ diskHash: RECORDED })).toEqual({
      action: 'write',
      label: 'updated',
      backup: false,
      refreshRecord: true,
      forced: false,
    });
  });

  it('row 4: disk differs from the record → SKIP modified, record NOT refreshed', () => {
    expect(decide({ diskHash: USER })).toEqual({
      action: 'skip',
      label: 'modified',
      backup: false,
      refreshRecord: false,
      forced: false,
    });
  });

  it('row 5: records available but this path has none → SKIP unrecorded', () => {
    expect(decide({ recordedHash: null })).toMatchObject({
      action: 'skip',
      label: 'unrecorded',
      refreshRecord: false,
    });
  });

  it('row 6: records unavailable → SKIP unverifiable (the pre-upgrade install)', () => {
    expect(
      decide({ recordsAvailable: false, recordedHash: null }),
    ).toMatchObject({ action: 'skip', label: 'unverifiable' });
  });

  it('row 6 wins over row 5 — an unusable store is never read for a per-path record', () => {
    // A stale/rejected store must not leak individual entries back in.
    expect(
      decide({ recordsAvailable: false, recordedHash: RECORDED }),
    ).toMatchObject({ label: 'unverifiable' });
  });
});

describe('decideFileAction — --force', () => {
  it.each([
    ['modified', { diskHash: USER }],
    ['unrecorded', { recordedHash: null }],
    ['unverifiable', { recordsAvailable: false, recordedHash: null }],
  ])('force converts the %s SKIP into a backed-up WRITE', (label, over) => {
    expect(decide({ ...over, force: true })).toEqual({
      action: 'write',
      label,
      backup: true,
      refreshRecord: true,
      forced: true,
    });
  });

  it('force does NOT request a backup for a restore (row 1) — there are no bytes to save', () => {
    expect(decide({ diskHash: null, force: true })).toMatchObject({
      action: 'write',
      backup: false,
      forced: false,
    });
  });

  it('force does NOT turn an identical file (row 2) into a write', () => {
    expect(decide({ diskHash: LATEST, force: true })).toMatchObject({
      action: 'noop',
      backup: false,
    });
  });

  it('force does NOT mark a clean upgrade (row 3) as forced or backed up', () => {
    expect(decide({ diskHash: RECORDED, force: true })).toMatchObject({
      action: 'write',
      label: 'updated',
      backup: false,
      forced: false,
    });
  });
});

describe('planUpdate — the whole-run planner', () => {
  const file = (hash: string): DiskState => ({ kind: 'file', hash });

  function plan(force = false) {
    return planUpdate({
      latestHashes: new Map([
        ['keep.md', LATEST],
        ['clean.md', LATEST],
        ['edited.md', LATEST],
        ['gone.md', LATEST],
        ['stranger.md', LATEST],
      ]),
      diskStates: new Map<string, DiskState>([
        ['keep.md', file(LATEST)], // row 2 ok
        ['clean.md', file(RECORDED)], // row 3 updated
        ['edited.md', file(USER)], // row 4 modified
        ['gone.md', { kind: 'absent' }], // row 1 restored
        ['stranger.md', file(USER)], // row 5 unrecorded
      ]),
      records: {
        'keep.md': USER, // stale entry — row 2 refreshes it anyway
        'clean.md': RECORDED,
        'edited.md': RECORDED,
        'gone.md': RECORDED,
        'obsolete.md': RECORDED, // no longer in the manifest
      },
      force,
    });
  }

  it('derives the write set, the backup set and the counts', () => {
    const p = plan();
    expect(p.writes).toEqual(['clean.md', 'gone.md']);
    expect(p.backups).toEqual([]);
    expect(p.counts).toEqual({
      updated: 1,
      restored: 1,
      ok: 1,
      forced: 0,
      skipped: 2,
    });
  });

  it('groups skips by label in a deterministic order, most actionable first', () => {
    expect(plan().skipped).toEqual([
      { label: 'modified', rels: ['edited.md'] },
      { label: 'unrecorded', rels: ['stranger.md'] },
    ]);
  });

  it('prunes records to the manifest — an entry for a path no longer installed is dropped', () => {
    const p = plan();
    expect(p.nextRecords['obsolete.md']).toBeUndefined();
    // written/identical → the upstream hash; skipped → the previous entry.
    expect(p.nextRecords).toEqual({
      'keep.md': LATEST,
      'clean.md': LATEST,
      'gone.md': LATEST,
      'edited.md': RECORDED,
      // 'stranger.md' had no record and was skipped → still none.
    });
  });

  it('under --force every skip becomes a backed-up write, counted separately', () => {
    const p = plan(true);
    expect(p.writes).toEqual([
      'clean.md',
      'edited.md',
      'gone.md',
      'stranger.md',
    ]);
    expect(p.backups).toEqual(['edited.md', 'stranger.md']);
    expect(p.counts).toMatchObject({ forced: 2, skipped: 0 });
    expect(p.skipped).toEqual([]);
    expect(p.nextRecords['edited.md']).toBe(LATEST);
    expect(p.nextRecords['stranger.md']).toBe(LATEST);
  });

  it('records unavailable → every differing file is unverifiable, and nothing is written but the restore', () => {
    const p = planUpdate({
      latestHashes: new Map([
        ['a.md', LATEST],
        ['b.md', LATEST],
        ['c.md', LATEST],
      ]),
      diskStates: new Map<string, DiskState>([
        ['a.md', file(USER)],
        ['b.md', file(LATEST)],
        ['c.md', { kind: 'absent' }],
      ]),
      records: null,
      force: false,
    });
    expect(p.writes).toEqual(['c.md']);
    expect(p.skipped).toEqual([{ label: 'unverifiable', rels: ['a.md'] }]);
    // The partial heal: only the already-identical file regains a record.
    expect(p.nextRecords).toEqual({ 'b.md': LATEST, 'c.md': LATEST });
  });

  it('an unreadable destination is a named skip, never a write and never a crash', () => {
    const p = planUpdate({
      latestHashes: new Map([['dir.md', LATEST]]),
      diskStates: new Map<string, DiskState>([
        ['dir.md', { kind: 'unreadable', reason: 'not a regular file' }],
      ]),
      records: { 'dir.md': RECORDED },
      force: false,
    });
    expect(p.writes).toEqual([]);
    expect(p.skipped).toEqual([{ label: 'unreadable', rels: ['dir.md'] }]);
    // Its previous record survives untouched.
    expect(p.nextRecords).toEqual({ 'dir.md': RECORDED });
  });

  it('an unreadable destination is NOT overwritten even under --force', () => {
    const p = planUpdate({
      latestHashes: new Map([['dir.md', LATEST]]),
      diskStates: new Map<string, DiskState>([
        ['dir.md', { kind: 'unreadable', reason: 'not a regular file' }],
      ]),
      records: null,
      force: true,
    });
    expect(p.writes).toEqual([]);
    expect(p.backups).toEqual([]);
  });

  it('a path missing from diskStates defaults to absent (restore), never to a silent skip', () => {
    const p = planUpdate({
      latestHashes: new Map([['x.md', LATEST]]),
      diskStates: new Map(),
      records: null,
      force: false,
    });
    expect(p.writes).toEqual(['x.md']);
  });
});
