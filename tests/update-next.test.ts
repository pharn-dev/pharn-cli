import { describe, expect, it } from 'vitest';
import {
  changesNoFiles,
  changesNothing,
  nextConfig,
  nextRecordStore,
  planStateChanges,
} from '../src/lib/update-next.js';
import type { ModelsUpdate } from '../src/lib/models-update.js';
import type { ReadRecordsResult } from '../src/lib/install-records.js';
import type { PharnConfig } from '../src/types.js';

// CORE-162: the next state of a `pharn update` run as pure values, and the ONE
// "changes nothing" predicate the real run, the dry run and `--json` read.

const SHA = 'a'.repeat(40);
const H = (c: string): string => c.repeat(64);

function config(over: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.18.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: SHA,
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller', source: 'auto' }],
    layout: 'flat',
    pendingSkillsVersion: '1.1.0',
    ...over,
  };
}

const models = (over: Partial<ModelsUpdate> = {}): ModelsUpdate =>
  ({
    outcome: 'ok',
    label: null,
    replacedLegacyDefault: false,
    next: undefined,
    nextRecord: null,
    backup: false,
    conversion: null,
    problems: [],
    upstreamReasons: [],
    ...over,
  }) as ModelsUpdate;

// The apply inputs of a withheld run over `config()`: the bump stays at 1.0.0,
// 1.1.0 pending, and the records already describe the disk.
function apply(over: Record<string, unknown> = {}) {
  return {
    frozenRecords: {},
    orphanRecords: {},
    plan: {
      files: [],
      writes: [],
      backups: [],
      skipped: [],
      counts: { updated: 0, restored: 0, ok: 1, forced: 0, skipped: 1 },
      nextRecords: { 'a.md': H('1'), 'b.md': H('2') },
      held: null,
    },
    models: models(),
    nextSkillsVersion: '1.0.0',
    nextCommit: SHA as string | null,
    frozenKeys: [] as string[],
    configCapabilities: [
      { name: 'a11y', role: 'griller' as const, source: 'auto' as const },
    ],
    ...over,
  };
}

const report = (over: Record<string, unknown> = {}) => ({
  pendingSkillsVersion: '1.1.0' as string | null,
  layout: 'flat' as const,
  ...over,
});

function store(over: Record<string, unknown> = {}): ReadRecordsResult {
  return {
    kind: 'ok',
    store: {
      schemaVersion: 1,
      skillsVersion: '1.0.0',
      commit: SHA,
      files: { 'b.md': H('2'), 'a.md': H('1') },
      ...over,
    },
  };
}

function state(input: {
  config?: PharnConfig;
  report?: ReturnType<typeof report>;
  apply?: ReturnType<typeof apply>;
  channel?: 'latest' | 'main';
  loadedRecords?: ReadRecordsResult;
}) {
  return planStateChanges({
    config: input.config ?? config(),
    report: input.report ?? report(),
    apply: input.apply ?? apply(),
    channel: input.channel ?? 'main',
    loadedRecords: input.loadedRecords ?? store(),
  });
}

describe('nextRecordStore / nextConfig — what the writer writes', () => {
  it('builds the store from the plan, the written hashes and the models record, minus retired orphans', () => {
    const next = nextRecordStore(
      apply({
        frozenRecords: { 'f.md': H('3') },
        orphanRecords: { 'o.md': H('4'), 'LIMITS.md': H('5') },
        models: models({ nextRecord: H('6') }),
      }),
      { written: { 'a.md': H('7') }, retired: new Set(['LIMITS.md']) },
    );
    expect(next).toEqual({
      skillsVersion: '1.0.0',
      commit: SHA,
      files: {
        'f.md': H('3'),
        'o.md': H('4'),
        'a.md': H('7'),
        'b.md': H('2'),
        'pharn.config.json#/models': H('6'),
      },
    });
  });

  it('sets the write stamp, the channel and the plan fields, and drops stale ones', () => {
    const next = nextConfig(
      config({ ref: 'latest', frozenCapabilities: ['lens:x'] }),
      report({ pendingSkillsVersion: null }),
      apply(),
      'main',
      { pharnVersion: '9.9.9', updatedAt: 'now' },
    );
    expect(next.pharnVersion).toBe('9.9.9');
    expect(next.updatedAt).toBe('now');
    expect('ref' in next).toBe(false);
    expect('frozenCapabilities' in next).toBe(false);
    expect('pendingSkillsVersion' in next).toBe(false);
    expect(next.installedAt).toBe('2026-06-11T00:00:00.000Z');
  });
});

describe('planStateChanges — against what the run LOADED', () => {
  it('a withheld re-run over unchanged state changes neither file', () => {
    expect(state({})).toEqual({ config: false, records: false });
  });

  it('ignores updatedAt and pharnVersion, and key order', () => {
    const { updatedAt: _u, pharnVersion: _p, ...rest } = config();
    expect(
      state({ config: { pharnVersion: '0.1.0', ...rest } as PharnConfig })
        .config,
    ).toBe(false);
  });

  it('counts a real config change: pending, frozen, capabilities, models, layout, channel, commit', () => {
    expect(
      state({ report: report({ pendingSkillsVersion: null }) }).config,
    ).toBe(true);
    expect(state({ apply: apply({ frozenKeys: ['lens:x'] }) }).config).toBe(
      true,
    );
    expect(
      state({
        apply: apply({
          configCapabilities: [{ name: 'a11y', role: 'griller' }],
        }),
      }).config,
    ).toBe(true);
    expect(
      state({ apply: apply({ models: models({ next: { stages: {} } }) }) })
        .config,
    ).toBe(true);
    expect(state({ report: report({ layout: 'pharn' }) }).config).toBe(true);
    expect(state({ channel: 'latest' }).config).toBe(true);
    expect(state({ apply: apply({ nextCommit: 'b'.repeat(40) }) }).config).toBe(
      true,
    );
  });

  // Gate-1 decision: load-time coercions never force a write. Both sides are
  // read the way the reader reads them; a real difference still counts.
  describe('load-time resolution', () => {
    it('an absent layout is the flat layout the clone records', () => {
      const { layout: _l, ...noLayout } = config();
      expect(state({ config: noLayout as PharnConfig }).config).toBe(false);
    });

    it('an absent layout is still a change when the clone is the pharn layout', () => {
      const { layout: _l, ...noLayout } = config();
      expect(
        state({
          config: noLayout as PharnConfig,
          report: report({ layout: 'pharn' }),
        }).config,
      ).toBe(true);
    });

    it('an absent commit is null, on either side of the config comparison', () => {
      const { commit: _c, ...noCommit } = config();
      expect(
        state({
          config: noCommit as PharnConfig,
          apply: apply({ nextCommit: null }),
          loadedRecords: store({ commit: null }),
        }),
      ).toEqual({ config: false, records: false });
      expect(
        state({
          config: config({ commit: null }),
          apply: apply({ nextCommit: undefined }),
          loadedRecords: store({ commit: null }),
        }).config,
      ).toBe(false);
      expect(
        state({
          config: config({ commit: null }),
          apply: apply({ nextCommit: null }),
          loadedRecords: store({ commit: null }),
        }),
      ).toEqual({ config: false, records: false });
    });

    it('a ref other than "latest" means main, so a main run does not rewrite it', () => {
      expect(
        state({
          config: config({ ref: 'bogus' } as unknown as Partial<PharnConfig>),
        }).config,
      ).toBe(false);
    });
  });

  it('counts a records change: a hash, a stamp, a missing models record, an absent or invalid store', () => {
    expect(
      state({ loadedRecords: store({ files: { 'a.md': H('1') } }) }).records,
    ).toBe(true);
    expect(
      state({ loadedRecords: store({ skillsVersion: '0.9.0' }) }).records,
    ).toBe(true);
    expect(state({ loadedRecords: store({ commit: null }) }).records).toBe(
      true,
    );
    expect(
      state({ apply: apply({ models: models({ nextRecord: H('9') }) }) })
        .records,
    ).toBe(true);
    expect(state({ loadedRecords: { kind: 'absent' } }).records).toBe(true);
    expect(
      state({ loadedRecords: { kind: 'invalid', message: 'x' } }).records,
    ).toBe(true);
  });
});

describe('changesNothing — the one predicate', () => {
  const quiet = {
    writes: [] as string[],
    removals: [] as {
      present: boolean;
    }[],
    rootMigration: null as null | {
      docs: { action: string }[];
      moves: { action: string }[];
    },
    gitignore: { action: 'none' } as { action: string },
    prettierignore: { action: 'none' } as { action: string },
  };
  const same = { config: false, records: false };
  type R = Parameters<typeof changesNothing>[0];
  const r = (over: Record<string, unknown>): R => ({ ...quiet, ...over }) as R;

  it('is true only when every clause is empty', () => {
    expect(changesNothing(r({}), same)).toBe(true);
    expect(changesNoFiles(r({}))).toBe(true);
  });

  it.each([
    ['a file write', { writes: ['a.md'] }],
    ['a present removal', { removals: [{ present: true }] }],
    [
      'a root-doc delete',
      { rootMigration: { docs: [{ action: 'delete' }], moves: [] } },
    ],
    [
      'a user-data move',
      { rootMigration: { docs: [], moves: [{ action: 'move' }] } },
    ],
    ['a .gitignore addition', { gitignore: { action: 'append' } }],
    ['a .prettierignore addition', { prettierignore: { action: 'create' } }],
  ])('is false for %s', (_name, over) => {
    expect(changesNothing(r(over), same)).toBe(false);
    expect(changesNoFiles(r(over))).toBe(false);
  });

  it('is false when either state file changes', () => {
    expect(changesNothing(r({}), { config: true, records: false })).toBe(false);
    expect(changesNothing(r({}), { config: false, records: true })).toBe(false);
  });

  it('ignores what writes nothing: an absent removal, a kept doc, a blocked move, a refused .gitignore', () => {
    expect(
      changesNothing(
        r({
          removals: [{ present: false }],
          rootMigration: {
            docs: [{ action: 'keep-edited' }],
            moves: [{ action: 'conflict' }],
          },
          gitignore: { action: 'refused' },
        }),
        same,
      ),
    ).toBe(true);
  });
});
