import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildUpdateReport,
  UPDATE_SCHEMA_VERSION,
  type UpdateReportInput,
} from '../src/lib/update-report.js';
import { serializeJsonReport } from '../src/lib/json-report.js';
import type { UpdatePlanReport } from '../src/lib/update-plan.js';

// Code points, not raw characters, so no control byte sits in this source.
const ESC = '\u001b';
const RLO = String.fromCodePoint(0x202e);
const LS = String.fromCodePoint(0x2028);

function planReport(over: Partial<UpdatePlanReport> = {}): UpdatePlanReport {
  return {
    currentVersion: '1.0.0',
    installedVersion: '1.1.0',
    recordedVersion: '1.0.0',
    versionWithheld: true,
    pendingSkillsVersion: '1.1.0',
    frozenCapabilities: ['griller:old'],
    capCount: 2,
    layout: 'pharn',
    abandonedLayout: 'flat',
    featuresReadmeRelocation: true,
    capabilityChanges: [
      {
        cap: { name: 'a11y', role: 'griller', source: 'auto' },
        reason: 'added',
      },
      { cap: { name: 'legacy', role: 'lens' }, reason: 'kept-manual' },
      {
        cap: { name: 'stale', role: 'lens', source: 'auto' },
        reason: 'dropped-unselected',
      },
    ],
    removals: [
      {
        cap: { name: 'stale', role: 'lens', source: 'auto' },
        reason: 'dropped-unselected',
        dir: 'pharn/pharn-review/stale',
        present: true,
        backups: ['pharn/pharn-review/stale/NOTES.md'],
      },
    ],
    files: [
      {
        rel: 'a.md',
        action: 'write',
        label: 'restored',
        backup: false,
        forced: false,
      },
      {
        rel: 'b.md',
        action: 'write',
        label: 'modified',
        backup: true,
        forced: true,
      },
      {
        rel: 'c.md',
        action: 'skip',
        label: 'unreadable',
        backup: false,
        forced: false,
      },
    ],
    writes: ['a.md', 'b.md'],
    backups: ['b.md', 'pharn.config.json'],
    skipped: [{ label: 'unreadable', rels: ['c.md'] }],
    counts: { updated: 0, restored: 1, ok: 4, forced: 1, skipped: 1 },
    models: {
      outcome: 'kept',
      label: 'modified',
      replacedLegacyDefault: false,
      next: { stages: { default: { model: 'SECRET-BLOCK' } } },
      nextRecord: 'sha256-internal',
      backup: true,
      conversion: { block: {}, changes: ['moved default'], leftovers: ['x'] },
      problems: ['stage "x" is wrong'],
      upstreamReasons: [],
    },
    modelsFloor: 'pharn/floor',
    hookWiring: {
      status: 'local-only',
      missing: [],
      localOnly: [
        { event: 'Stop', matcher: '', command: 'node', args: ['h.cjs'] },
      ],
    },
    absentUpstream: [],
    recordsNote: 'records were left by another tool',
    unknownWarning: 'prose that must not be in the JSON',
    unknownCapabilities: [
      {
        name: 'weird',
        role: 'griller',
        subtree: 'pharn/grillers',
        reason: 'bad role',
      },
    ],
    orphans: [],
    ...over,
  };
}

const ORPHANS: UpdatePlanReport['orphans'] = [
  { path: '.claude/commands/pharn-old.md', state: 'unchanged' },
  {
    path: '.claude/hooks/linked.cjs',
    state: 'unreadable',
    reason: 'the path is a symlink',
  },
];

function input(over: Partial<UpdateReportInput> = {}): UpdateReportInput {
  return {
    status: 'planned',
    force: false,
    channel: 'main',
    currentChannel: 'main',
    source: { kind: 'main' },
    installed: '1.0.0',
    latest: '1.1.0',
    archetypes: ['ssr'],
    plan: planReport(),
    ...over,
  };
}

describe('buildUpdateReport — planned', () => {
  const r = buildUpdateReport(input({ force: true }));

  it('carries the envelope', () => {
    expect(r.schemaVersion).toBe(UPDATE_SCHEMA_VERSION);
    expect(UPDATE_SCHEMA_VERSION).toBe(1);
    expect(r).toMatchObject({
      command: 'update',
      dryRun: true,
      status: 'planned',
      force: true,
      channel: 'main',
      channelChange: null,
      source: { kind: 'main', tag: null },
      archetypes: ['ssr'],
    });
  });

  it('reports the version triple the real run would record', () => {
    expect(r.version).toEqual({
      installed: '1.0.0',
      latest: '1.1.0',
      recorded: '1.0.0',
      withheld: true,
      pending: '1.1.0',
    });
  });

  it('maps every planned file with its action, label, backup and forced bits', () => {
    expect(r.plan!.files).toEqual([
      {
        rel: 'a.md',
        action: 'write',
        label: 'restored',
        backup: false,
        forced: false,
      },
      {
        rel: 'b.md',
        action: 'write',
        label: 'modified',
        backup: true,
        forced: true,
      },
      {
        rel: 'c.md',
        action: 'skip',
        label: 'unreadable',
        backup: false,
        forced: false,
      },
    ]);
    expect(r.plan!.writes).toEqual(['a.md', 'b.md']);
    expect(r.plan!.backups).toEqual(['b.md', 'pharn.config.json']);
    expect(r.plan!.skipped).toEqual([{ label: 'unreadable', rels: ['c.md'] }]);
    expect(r.plan!.counts).toEqual({
      updated: 0,
      restored: 1,
      ok: 4,
      forced: 1,
      skipped: 1,
    });
  });

  it('maps capability changes, with an absent source as null', () => {
    expect(r.plan!.capabilities).toEqual({
      count: 2,
      changes: [
        { role: 'griller', name: 'a11y', source: 'auto', reason: 'added' },
        { role: 'lens', name: 'legacy', source: null, reason: 'kept-manual' },
        {
          role: 'lens',
          name: 'stale',
          source: 'auto',
          reason: 'dropped-unselected',
        },
      ],
      removals: [
        {
          role: 'lens',
          name: 'stale',
          reason: 'dropped-unselected',
          dir: 'pharn/pharn-review/stale',
          present: true,
          backups: ['pharn/pharn-review/stale/NOTES.md'],
        },
      ],
    });
  });

  // F-04: the directories a real run would DELETE are part of the plan, so a
  // script reading the dry run sees a deletion before it happens. Additive
  // within schemaVersion 1, and present (as []) on every planned report.
  it('lists the capability directories a real run would delete, [] when none', () => {
    const none = buildUpdateReport(
      input({ plan: planReport({ removals: [] }) }),
    );
    expect(none.plan!.capabilities.removals).toEqual([]);
    expect(Object.keys(r.plan!.capabilities)).toEqual([
      'count',
      'changes',
      'removals',
    ]);
    expect(Object.keys(r.plan!.capabilities.removals[0]!)).toEqual([
      'role',
      'name',
      'reason',
      'dir',
      'present',
      'backups',
    ]);
  });

  it('maps layout, frozen and the structured unknown capabilities (never the prose)', () => {
    expect(r.plan).toMatchObject({
      layout: 'pharn',
      abandonedLayout: 'flat',
      featuresReadmeRelocation: true,
      frozenCapabilities: ['griller:old'],
      unknownCapabilities: [
        {
          role: 'griller',
          name: 'weird',
          subtree: 'pharn/grillers',
          reason: 'bad role',
        },
      ],
      recordsNote: 'records were left by another tool',
    });
    expect(JSON.stringify(r)).not.toContain('prose that must not be');
  });

  it('maps hooks with absent fields as []/null', () => {
    expect(r.plan!.hooks).toEqual({
      status: 'local-only',
      missing: [],
      localOnly: [
        { event: 'Stop', matcher: '', command: 'node', args: ['h.cjs'] },
      ],
      file: null,
      reason: null,
    });
    const plain = buildUpdateReport(
      input({
        plan: planReport({ hookWiring: { status: 'match', missing: [] } }),
      }),
    );
    expect(plain.plan!.hooks.localOnly).toEqual([]);
  });

  it('omits the models block and its record, keeping the outcome and the reasons', () => {
    expect(r.plan!.models).toEqual({
      outcome: 'kept',
      label: 'modified',
      replacedLegacyDefault: false,
      backup: true,
      conversion: { changes: ['moved default'], leftovers: ['x'] },
      problems: ['stage "x" is wrong'],
      upstreamReasons: [],
    });
    const text = JSON.stringify(r);
    expect(text).not.toContain('SECRET-BLOCK');
    expect(text).not.toContain('sha256-internal');
  });

  // The projection is an allowlist: a field added to UpdatePlanReport later must
  // not become public contract by accident. These key sets ARE the contract.
  // F-10: the declared surfaces the clone ships no file for, as data. Present
  // ONLY when there is one, so a report with none stays byte-identical to the
  // one 0.10.0 shipped (pinned below).
  it('omits absentUpstream when the clone ships every declared surface', () => {
    expect('absentUpstream' in r.plan!).toBe(false);
  });

  it('projects absentUpstream as {surface, path} rows after hooks, path capped', () => {
    const withAbsent = buildUpdateReport(
      input({
        plan: planReport({
          absentUpstream: [
            { surface: 'hooks', path: '.claude/hooks' },
            { surface: 'floor', path: 'x'.repeat(500) },
          ],
        }),
      }),
    );
    const keys = Object.keys(withAbsent.plan!);
    expect(keys.indexOf('absentUpstream')).toBe(keys.indexOf('hooks') + 1);
    expect(withAbsent.plan!.absentUpstream![0]).toEqual({
      surface: 'hooks',
      path: '.claude/hooks',
    });
    expect(withAbsent.plan!.absentUpstream![1]!.path.length).toBeLessThan(500);
    expect(Object.keys(withAbsent.plan!.absentUpstream![1]!)).toEqual([
      'surface',
      'path',
    ]);
  });

  it('exposes exactly the documented keys at every level', () => {
    expect(Object.keys(r)).toEqual([
      'schemaVersion',
      'command',
      'dryRun',
      'status',
      'force',
      'channel',
      'channelChange',
      'source',
      'version',
      'archetypes',
      'plan',
    ]);
    expect(Object.keys(r.plan!)).toEqual([
      'layout',
      'abandonedLayout',
      'featuresReadmeRelocation',
      'capabilities',
      'files',
      'writes',
      'backups',
      'skipped',
      'counts',
      'models',
      'hooks',
      'frozenCapabilities',
      'unknownCapabilities',
      'recordsNote',
    ]);
    const withOrphans = buildUpdateReport(
      input({ plan: planReport({ orphans: ORPHANS }) }),
    ).plan!;
    expect(Object.keys(withOrphans).at(-1)).toBe('orphans');
    expect(Object.keys(withOrphans.orphans![0]!)).toEqual(['path', 'state']);
    expect(Object.keys(withOrphans.orphans![1]!)).toEqual([
      'path',
      'state',
      'reason',
    ]);
    expect(Object.keys(r.plan!.models)).toEqual([
      'outcome',
      'label',
      'replacedLegacyDefault',
      'backup',
      'conversion',
      'problems',
      'upstreamReasons',
    ]);
    expect(Object.keys(r.plan!.files[0]!)).toEqual([
      'rel',
      'action',
      'label',
      'backup',
      'forced',
    ]);
    expect(Object.keys(r.version)).toEqual([
      'installed',
      'latest',
      'recorded',
      'withheld',
      'pending',
    ]);
  });

  // Additive within schemaVersion 1, and ABSENT when there is none — so the
  // report of an install with no orphans keeps its exact bytes (pinned below).
  it('lists the orphans when there are some, reason only where there is one', () => {
    const q = buildUpdateReport(
      input({ plan: planReport({ orphans: ORPHANS }) }),
    );
    expect(q.schemaVersion).toBe(1);
    expect(q.plan!.orphans).toEqual(ORPHANS);
    expect(r.plan).not.toHaveProperty('orphans');
  });

  it('never filters the orphans under --compact', () => {
    const compact = buildUpdateReport(
      input({ compact: true, plan: planReport({ orphans: ORPHANS }) }),
    );
    expect(compact.plan!.orphans).toEqual(ORPHANS);
  });

  it('reports a null conversion and a null recordsNote as null', () => {
    const q = buildUpdateReport(
      input({
        plan: planReport({
          recordsNote: null,
          models: { ...planReport().models, conversion: null },
        }),
      }),
    );
    expect(q.plan!.models.conversion).toBeNull();
    expect(q.plan!.recordsNote).toBeNull();
  });
});

describe('buildUpdateReport — early returns and channel', () => {
  it.each(['up-to-date', 'ahead-of-release', 'ahead-of-main'] as const)(
    '%s has plan:null and null plan-derived versions',
    (status) => {
      const r = buildUpdateReport(input({ status, plan: null }));
      expect(r.status).toBe(status);
      expect(r.plan).toBeNull();
      expect(r.version).toEqual({
        installed: '1.0.0',
        latest: '1.1.0',
        recorded: null,
        withheld: null,
        pending: null,
      });
    },
  );

  it('names the tag of a release source and the channel it would record', () => {
    const r = buildUpdateReport(
      input({
        channel: 'latest',
        currentChannel: 'main',
        source: {
          kind: 'release',
          tag: 'v1.1.0',
          version: '1.1.0',
          sha: 'b'.repeat(40),
        },
      }),
    );
    expect(r.source).toEqual({ kind: 'release', tag: 'v1.1.0' });
    expect(r.channelChange).toEqual({ from: 'main', to: 'latest' });
  });
});

describe('buildUpdateReport — untrusted text', () => {
  const hostile = `x${ESC}[31m${RLO}${LS}y`;
  const long = 'z'.repeat(5000);

  it('caps free text and serializes it escaped, losslessly', () => {
    const r = buildUpdateReport(
      input({
        plan: planReport({
          recordsNote: long,
          models: {
            ...planReport().models,
            problems: [hostile, long],
            upstreamReasons: [long],
            conversion: { block: {}, changes: [long], leftovers: [hostile] },
          },
          unknownCapabilities: [
            { name: long, role: 'lens', subtree: long, reason: long },
          ],
        }),
      }),
    );
    expect(r.plan!.recordsNote!.length).toBeLessThanOrEqual(301);
    expect(r.plan!.models.problems[1]!.length).toBeLessThanOrEqual(301);
    expect(r.plan!.models.upstreamReasons[0]!.length).toBeLessThanOrEqual(301);
    expect(r.plan!.models.conversion!.changes[0]!.length).toBeLessThanOrEqual(
      301,
    );
    expect(r.plan!.unknownCapabilities[0]!.name.length).toBeLessThanOrEqual(
      201,
    );
    expect(r.plan!.unknownCapabilities[0]!.reason.length).toBeLessThanOrEqual(
      201,
    );

    const out = serializeJsonReport(r);
    expect(out).not.toContain(ESC);
    expect(out).not.toContain(RLO);
    expect(out).not.toContain(LS);
    expect(JSON.parse(out).plan.models.problems[0]).toBe(hostile);
  });

  it('escapes a hostile rel path and capability name the same way', () => {
    const r = buildUpdateReport(
      input({
        plan: planReport({
          files: [
            {
              rel: hostile,
              action: 'write',
              label: 'restored',
              backup: false,
              forced: false,
            },
          ],
          writes: [hostile],
          capabilityChanges: [
            { cap: { name: hostile, role: 'lens' }, reason: 'added' },
          ],
        }),
      }),
    );
    const out = serializeJsonReport(r);
    expect(out).not.toContain(ESC);
    expect(JSON.parse(out).plan.writes[0]).toBe(hostile);
  });
});

// ---------------------------------------------------------------------------
// The default report is byte-identical to 0.10.0: pinned by hash, captured from
// the builder BEFORE `--compact` existed.
// ---------------------------------------------------------------------------
const sha = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

describe('buildUpdateReport — default output is unchanged', () => {
  // The 0.10.0 fixture had no drop, so its plan carried no removal. The ONE
  // byte difference since is the additive `plan.capabilities.removals` key
  // (F-04): strip it and the 0.10.0 bytes come back exactly.
  it('serializes the planned fixture to the exact 0.10.0 bytes plus the additive removals key', () => {
    const fixture = planReport();
    const text = serializeJsonReport(
      buildUpdateReport(
        input({
          force: true,
          plan: planReport({
            capabilityChanges: fixture.capabilityChanges.filter(
              (c) => c.reason !== 'dropped-unselected',
            ),
            removals: [],
          }),
        }),
      ),
    );
    const removalsKey = /,\n {6}"removals": \[\]/;
    expect(text).toMatch(removalsKey);
    expect(sha(text.replace(removalsKey, ''))).toBe(
      '13a9755b35bf7eb73c52357d17572aedeeb61ce1e737026267c17447169f8615',
    );
    expect(text).not.toContain('"compact"');
    expect(text).not.toContain('filesOmitted');
  });

  it('serializes an early return to the exact 0.10.0 bytes', () => {
    const text = serializeJsonReport(
      buildUpdateReport(input({ status: 'up-to-date', plan: null })),
    );
    expect(sha(text)).toBe(
      'e020755f74fb843f747e4eda160f8165ae5bce9b1a38fd58b28964ed0951a81c',
    );
    expect(text).not.toContain('"compact"');
  });
});

// ---------------------------------------------------------------------------
// `--compact`: the `noop` entries of `plan.files` are omitted, and the report
// says so.
// ---------------------------------------------------------------------------
const noop = (rel: string): UpdatePlanReport['files'][number] => ({
  rel,
  action: 'noop',
  label: 'ok',
  backup: false,
  forced: false,
});

describe('buildUpdateReport — compact', () => {
  const base = planReport();
  const files: UpdatePlanReport['files'] = [
    noop('n1.md'),
    ...base.files,
    noop('n2.md'),
  ];
  const withNoops = planReport({
    files,
    counts: { ...base.counts, ok: 2 },
  });
  const full = buildUpdateReport(input({ plan: withNoops }));
  const compact = buildUpdateReport(input({ plan: withNoops, compact: true }));

  it('omits exactly the noop entries, in order, and keeps the rest whole', () => {
    expect(compact.plan!.files).toEqual(
      full.plan!.files.filter((f) => f.action !== 'noop'),
    );
    expect(compact.plan!.files.map((f) => f.rel)).toEqual([
      'a.md',
      'b.md',
      'c.md',
    ]);
  });

  it('says what was omitted, and the count matches counts.ok', () => {
    expect(compact.compact).toBe(true);
    expect(compact.plan!.filesOmitted).toEqual({ action: 'noop', count: 2 });
    expect(compact.plan!.filesOmitted!.count).toBe(compact.plan!.counts.ok);
    expect(compact.plan!.files.length + compact.plan!.filesOmitted!.count).toBe(
      full.plan!.files.length,
    );
  });

  it('changes nothing but files and the two markers', () => {
    const { compact: _c, ...rest } = compact;
    const { filesOmitted: _o, files: _f, ...planRest } = compact.plan!;
    const { files: _ff, ...fullPlanRest } = full.plan!;
    expect(rest).toEqual({ ...full, plan: rest.plan });
    expect(planRest).toEqual(fullPlanRest);
  });

  it('keeps the default shape marker-free', () => {
    expect(full).not.toHaveProperty('compact');
    expect(full.plan).not.toHaveProperty('filesOmitted');
    expect(compact.plan!.files.length).toBeLessThan(full.plan!.files.length);
  });

  it('marks an early return too, with a null plan', () => {
    for (const status of [
      'up-to-date',
      'ahead-of-release',
      'ahead-of-main',
    ] as const) {
      const r = buildUpdateReport(input({ status, plan: null, compact: true }));
      expect(r.compact).toBe(true);
      expect(r.plan).toBeNull();
    }
  });

  it('compact:false is the default shape, byte for byte', () => {
    expect(
      serializeJsonReport(
        buildUpdateReport(input({ plan: withNoops, compact: false })),
      ),
    ).toBe(serializeJsonReport(full));
  });

  it('still escapes a hostile rel on a kept entry, and drops one on an omitted noop', () => {
    const hostile = planReport({
      files: [
        noop(`${ESC}[2Jgone.md`),
        { ...noop(`${ESC}[2Jkept.md`), action: 'skip', label: 'modified' },
      ],
      counts: { updated: 0, restored: 0, ok: 1, forced: 0, skipped: 1 },
    });
    const text = serializeJsonReport(
      buildUpdateReport(input({ plan: hostile, compact: true })),
    );
    expect(text).toContain('\\u001b[2Jkept.md');
    expect(text).not.toContain('gone.md');
    expect(text).not.toContain(ESC);
  });
});

describe('buildUpdateReport — compact size on a realistic install', () => {
  // 504 installed files with argus-like paths: 500 unchanged, plus a restore, an
  // upgrade, a forced overwrite and an edited file that is skipped.
  const unchanged = Array.from({ length: 500 }, (_, i) =>
    noop(
      `pharn/pharn-review/lenses/lens-${i % 40}/references/reference-file-${i}.md`,
    ),
  );
  const changed: UpdatePlanReport['files'] = [
    {
      rel: 'CONSTITUTION.md',
      action: 'write',
      label: 'updated',
      backup: false,
      forced: false,
    },
    {
      rel: '.claude/commands/pharn-ship.md',
      action: 'write',
      label: 'restored',
      backup: false,
      forced: false,
    },
    {
      rel: '.claude/hooks/guard.cjs',
      action: 'write',
      label: 'modified',
      backup: true,
      forced: true,
    },
    {
      rel: '.claude/commands/pharn-plan.md',
      action: 'skip',
      label: 'modified',
      backup: false,
      forced: false,
    },
  ];
  const plan = planReport({
    files: [...unchanged, ...changed],
    writes: ['CONSTITUTION.md', '.claude/commands/pharn-ship.md'],
    backups: ['.claude/hooks/guard.cjs'],
    skipped: [{ label: 'modified', rels: ['.claude/commands/pharn-plan.md'] }],
    counts: { updated: 1, restored: 1, ok: 500, forced: 1, skipped: 1 },
    capabilityChanges: [],
    frozenCapabilities: [],
    unknownCapabilities: [],
    recordsNote: null,
  });
  const full = serializeJsonReport(buildUpdateReport(input({ plan })));
  const compact = serializeJsonReport(
    buildUpdateReport(input({ plan, compact: true })),
  );

  it('the fixture is big enough to mean something', () => {
    expect(full.length).toBeGreaterThan(60_000);
  });

  it('shrinks the report to a few KB, under 3% of the full one', () => {
    expect(compact.length).toBeLessThan(4096);
    expect(compact.length).toBeLessThan(full.length * 0.03);
  });

  it('keeps every changed entry and the complete counts', () => {
    const parsed = JSON.parse(compact);
    expect(parsed.plan.files).toHaveLength(4);
    expect(parsed.plan.counts.ok).toBe(500);
    expect(parsed.plan.filesOmitted).toEqual({ action: 'noop', count: 500 });
  });
});
