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
    ...over,
  };
}

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
      ],
    });
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
  it.each(['up-to-date', 'ahead-of-release'] as const)(
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
