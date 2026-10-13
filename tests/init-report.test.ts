import { describe, expect, it } from 'vitest';
import {
  buildInitReport,
  INIT_SCHEMA_VERSION,
} from '../src/lib/init-report.js';
import { serializeJsonReport } from '../src/lib/json-report.js';
import type { InitPlanReport } from '../src/lib/init-plan.js';

// The `pharn init --dry-run --json` projection: pure, explicit, capped.

const ESC = String.fromCharCode(27);
const LS = String.fromCharCode(0x2028);
const BIDI = String.fromCharCode(0x202e);

function plan(over: Partial<InitPlanReport> = {}): InitPlanReport {
  return {
    archetypes: ['ssr'],
    channel: 'main',
    source: { kind: 'main' },
    commit: 'a'.repeat(40),
    skillsVersion: '1.0.0',
    layout: 'flat',
    selection: {
      selected: [
        { name: 'a11y', role: 'griller', matched: ['ssr'] },
        { name: 'security', role: 'griller', matched: 'universal' },
      ],
      skipped: [
        {
          name: 'path-traversal',
          role: 'lens',
          reason: 'applies to [backend]; detected [ssr]',
        },
      ],
    },
    carry: {
      manual: ['lens:mine'],
      extra: [{ name: 'mine', role: 'lens', source: 'manual' }],
      kept: [],
      gone: [{ name: 'old', role: 'lens', source: 'manual' }],
    },
    unknownCapabilities: [],
    targets: [
      {
        rel: '.claude/commands/pharn-plan.md',
        action: 'overwrite',
        label: 'modified',
      },
      { rel: 'CONSTITUTION.md', action: 'create', label: null },
      { rel: 'pharn.config.json', action: 'overwrite', label: 'rewritten' },
    ],
    conflicts: ['.claude/commands/pharn-plan.md', 'pharn.config.json'],
    configBackedUp: true,
    backups: ['.claude/commands/pharn-plan.md', 'pharn.config.json'],
    counts: { create: 1, overwrite: 2, backup: 2 },
    settingsPreserved: false,
    hookWiring: null,
    models: { outcome: 'copy', reasons: [] },
    carriedConfigKeys: ['testResults'],
    ...over,
  };
}

describe('buildInitReport', () => {
  it('carries the contract fields, and nothing internal', () => {
    const r = buildInitReport(plan());
    expect(Object.keys(r)).toEqual([
      'schemaVersion',
      'command',
      'dryRun',
      'status',
      'channel',
      'source',
      'commit',
      'skillsVersion',
      'layout',
      'archetypes',
      'capabilities',
      'unknownCapabilities',
      'targets',
      'backups',
      'counts',
      'yesWouldProceed',
      'settings',
      'hooks',
      'models',
      'config',
    ]);
    expect(r.schemaVersion).toBe(INIT_SCHEMA_VERSION);
    expect(r.schemaVersion).toBe(1);
    expect(r.command).toBe('init');
    expect(r.dryRun).toBe(true);
    expect(r.status).toBe('planned');
    expect(Object.keys(r.capabilities)).toEqual([
      'selected',
      'skipped',
      'carried',
    ]);
    expect(Object.keys(r.capabilities.carried)).toEqual([
      'manual',
      'kept',
      'dropped',
    ]);
    expect(r.capabilities.carried).toEqual({
      manual: ['lens:mine'],
      kept: [],
      dropped: ['lens:old'],
    });
    expect(r.capabilities.selected[1]).toEqual({
      role: 'griller',
      name: 'security',
      matched: 'universal',
    });
    expect(r.targets[0]).toEqual({
      rel: '.claude/commands/pharn-plan.md',
      action: 'overwrite',
      label: 'modified',
    });
    expect(r.counts).toEqual({ create: 1, overwrite: 2, backup: 2 });
    // The replaced config: rewritten, and backed up first (F-08).
    expect(r.targets[2]).toEqual({
      rel: 'pharn.config.json',
      action: 'overwrite',
      label: 'rewritten',
    });
    expect(r.backups).toEqual([
      '.claude/commands/pharn-plan.md',
      'pharn.config.json',
    ]);
    expect(r.source).toEqual({ kind: 'main', tag: null });
    expect(r.hooks).toBeNull();
    expect(r.config).toEqual({ carriedKeys: ['testResults'] });
    expect(r.settings).toEqual({ preserved: false });
  });

  it('yesWouldProceed is exactly counts.overwrite === 0', () => {
    expect(buildInitReport(plan()).yesWouldProceed).toBe(false);
    expect(
      buildInitReport(plan({ counts: { create: 3, overwrite: 0, backup: 0 } }))
        .yesWouldProceed,
    ).toBe(true);
  });

  it('names the release tag for a release install', () => {
    const r = buildInitReport(
      plan({
        channel: 'latest',
        source: {
          kind: 'release',
          tag: 'v1.0.0',
          version: '1.0.0',
          sha: 'b'.repeat(40),
        },
      }),
    );
    expect(r.source).toEqual({ kind: 'release', tag: 'v1.0.0' });
    expect(r.channel).toBe('latest');
  });

  it('projects the hooks diff when settings are preserved', () => {
    const entry = { event: 'Stop', matcher: '', command: 'node', args: ['x'] };
    const r = buildInitReport(
      plan({
        settingsPreserved: true,
        hookWiring: { status: 'missing', missing: [entry] },
      }),
    );
    expect(r.settings).toEqual({ preserved: true });
    expect(r.hooks).toEqual({
      status: 'missing',
      missing: [entry],
      localOnly: [],
      file: null,
      reason: null,
    });
  });

  it('caps and escapes untrusted text, losslessly', () => {
    const long = 'r'.repeat(5000);
    const hostile = `a${ESC}[31mb${LS}c${BIDI}d`;
    const r = buildInitReport(
      plan({
        unknownCapabilities: [
          {
            name: hostile,
            role: 'lens',
            subtree: 'pharn-review',
            reason: long,
          },
        ],
        models: { outcome: 'rejected', reasons: [long, hostile] },
        carriedConfigKeys: [hostile],
      }),
    );
    expect(r.unknownCapabilities[0]!.reason.length).toBeLessThanOrEqual(201);
    expect(r.models.reasons[0]!.length).toBeLessThanOrEqual(301);
    const text = serializeJsonReport(r);
    expect(text).not.toContain(ESC);
    expect(text).not.toContain(LS);
    expect(text).not.toContain(BIDI);
    const back = JSON.parse(text) as typeof r;
    expect(back.unknownCapabilities[0]!.name).toBe(hostile);
    expect(back.config.carriedKeys).toEqual([hostile]);
    expect(back.models.reasons[1]).toBe(hostile);
  });
});
