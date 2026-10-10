import { describe, expect, it } from 'vitest';
import type { InstallDiff } from '../src/lib/diff.js';
import type { HookWiringDiff } from '../src/lib/hook-wiring.js';
import type { InstallSource } from '../src/lib/release.js';
import {
  buildStatusReport,
  serializeStatusReport,
  strictFails,
  type StatusReportInput,
} from '../src/lib/status-report.js';
import type { PharnConfig } from '../src/types.js';

const CLEAN: InstallDiff = {
  modified: [],
  missing: [],
  unreadable: [],
  okCount: 3,
};
const HOOKS_OK: HookWiringDiff = { status: 'match', missing: [] };
const MAIN: InstallSource = { kind: 'main' };

function config(extra: Partial<PharnConfig> = {}): PharnConfig {
  return {
    pharnVersion: '0.9.0',
    skillsVersion: '1.0.0',
    repo: 'pharn-dev/pharn-oss',
    commit: 'c',
    modules: [],
    installedAt: '2026-06-11T00:00:00.000Z',
    archetypes: ['ssr'],
    capabilities: [{ name: 'a11y', role: 'griller' }],
    ...extra,
  };
}

function input(extra: Partial<StatusReportInput> = {}): StatusReportInput {
  return {
    node: { kind: 'ok', current: '24.5.0' },
    config: config(),
    channel: 'main',
    latest: '1.0.0',
    source: MAIN,
    drift: { diff: CLEAN, hooks: HOOKS_OK, unknown: [] },
    strict: false,
    ...extra,
  };
}

describe('buildStatusReport', () => {
  it('reports a clean drift-path install', () => {
    expect(buildStatusReport(input())).toEqual({
      schemaVersion: 1,
      node: { floor: '24.2.0', running: '24.5.0', status: 'ok' },
      version: {
        installed: '1.0.0',
        latest: '1.0.0',
        channel: 'main',
        source: { kind: 'main', tag: null },
        ahead: false,
        outdated: false,
      },
      archetypes: ['ssr'],
      capabilities: { count: 1 },
      drift: { modified: [], missing: [], unreadable: [], okCount: 3 },
      hooks: {
        status: 'match',
        missing: [],
        localOnly: [],
        file: null,
        reason: null,
      },
      models: null,
      unknownCapabilities: [],
      strict: { enabled: false, failed: false },
    });
  });

  it('nulls what --no-drift does not compute', () => {
    const r = buildStatusReport(input({ drift: null }));
    expect(r.drift).toBeNull();
    expect(r.hooks).toBeNull();
    expect(r.unknownCapabilities).toBeNull();
    expect(r.version.latest).toBe('1.0.0');
  });

  it('names a release source by its tag and derives ahead/outdated from versionStatus', () => {
    const source: InstallSource = {
      kind: 'release',
      tag: 'v1.0.0',
      version: '1.0.0',
      sha: 'b'.repeat(40),
    };
    const r = buildStatusReport(
      input({
        config: config({ skillsVersion: '2.0.0' }),
        channel: 'latest',
        source,
      }),
    );
    expect(r.version).toMatchObject({
      channel: 'latest',
      source: { kind: 'release', tag: 'v1.0.0' },
      ahead: true,
      outdated: false,
    });
  });

  it('reports the running node as null when none was reported, and caps a long one', () => {
    expect(
      buildStatusReport(
        input({ node: { kind: 'unparseable', raw: undefined } }),
      ).node,
    ).toMatchObject({ running: null, status: 'unparseable' });
    const long = buildStatusReport(
      input({ node: { kind: 'unparseable', raw: 'x'.repeat(100) } }),
    ).node.running!;
    expect(long).toHaveLength(41);
    expect(
      buildStatusReport(input({ node: { kind: 'below', current: '20.0.0' } }))
        .node,
    ).toMatchObject({ running: '20.0.0', status: 'below' });
  });

  it('maps the hook diff, args included, with file/reason when unreadable', () => {
    const entry = {
      event: 'Stop',
      matcher: '',
      command: 'node',
      args: ['a.cjs'],
    };
    const r = buildStatusReport(
      input({
        drift: {
          diff: CLEAN,
          hooks: {
            status: 'unreadable',
            missing: [entry],
            localOnly: [entry],
            file: '.claude/settings.json',
            reason: 'bad json',
          },
          unknown: [],
        },
      }),
    );
    expect(r.hooks).toEqual({
      status: 'unreadable',
      missing: [entry],
      localOnly: [entry],
      file: '.claude/settings.json',
      reason: 'bad json',
    });
  });

  it('caps unknown-capability fields at 200 characters', () => {
    const r = buildStatusReport(
      input({
        drift: {
          diff: CLEAN,
          hooks: HOOKS_OK,
          unknown: [
            {
              name: 'n'.repeat(300),
              role: 'lens',
              subtree: 's',
              reason: 'r'.repeat(300),
            },
          ],
        },
      }),
    );
    expect(r.unknownCapabilities![0]!.name).toHaveLength(201);
    expect(r.unknownCapabilities![0]!.reason).toHaveLength(201);
    expect(r.unknownCapabilities![0]).toMatchObject({
      role: 'lens',
      subtree: 's',
    });
  });

  describe('models', () => {
    const valid = {
      stages: {
        default: { model: 'sonnet', effort: 'high' },
        plan: { model: 'opus', effort: 'max' },
      },
    };
    it('is null when the config has no models block', () => {
      expect(buildStatusReport(input()).models).toBeNull();
    });
    it('reports a valid block as resolved rows', () => {
      const m = buildStatusReport(
        input({ config: config({ models: valid }) }),
      ).models!;
      expect(m).toMatchObject({ conversionNeeded: false, verdict: 'valid' });
      expect(m.stages![0]).toEqual({
        stage: 'default',
        model: 'sonnet',
        effort: 'high',
        viaDefault: false,
      });
      expect(m.reds).toBeNull();
    });
    it('reports the pre-0.7.0 format as old-format with nothing resolved', () => {
      const m = buildStatusReport(
        input({
          config: config({
            models: { default: { model: 'opus-4-8', effort: 'high' } },
          }),
        }),
      ).models!;
      expect(m).toEqual({
        conversionNeeded: true,
        verdict: 'old-format',
        stages: null,
        reds: null,
      });
    });
    it('reports rejected blocks as reds, each detail capped at 300', () => {
      const m = buildStatusReport(
        input({
          config: config({
            models: {
              stages: {
                default: { model: 'sonnet', effort: 'high' },
                ['x'.repeat(400)]: { model: 'sonnet', effort: 'high' },
              },
            },
          }),
        }),
      ).models!;
      expect(m.verdict).toBe('invalid');
      expect(m.stages).toBeNull();
      expect(m.reds!.length).toBeGreaterThan(0);
      for (const red of m.reds!)
        expect(red.detail.length).toBeLessThanOrEqual(301);
    });
    it('reports a block with no stages as no-stages', () => {
      const m = buildStatusReport(
        input({ config: config({ models: {} }) }),
      ).models!;
      expect(m).toMatchObject({ verdict: 'no-stages', stages: null });
    });
  });

  describe('strict', () => {
    it('is failed only when enabled AND a finding exists', () => {
      const modified = { ...CLEAN, modified: ['x'] };
      const drift = { diff: modified, hooks: HOOKS_OK, unknown: [] };
      expect(buildStatusReport(input({ drift })).strict).toEqual({
        enabled: false,
        failed: false,
      });
      expect(buildStatusReport(input({ drift, strict: true })).strict).toEqual({
        enabled: true,
        failed: true,
      });
      expect(buildStatusReport(input({ strict: true })).strict.failed).toBe(
        false,
      );
    });
    it('under --no-drift only the version can fail it', () => {
      expect(
        buildStatusReport(input({ drift: null, strict: true, latest: '2.0.0' }))
          .strict.failed,
      ).toBe(true);
    });
  });
});

describe('strictFails', () => {
  const base = { outdated: false, diff: CLEAN, hooks: HOOKS_OK };
  it('is false for a clean install, and for ahead-style (not outdated)', () => {
    expect(strictFails(base)).toBe(false);
    expect(strictFails({ outdated: false })).toBe(false);
  });
  it.each([
    ['outdated', { ...base, outdated: true }],
    ['modified', { ...base, diff: { ...CLEAN, modified: ['a'] } }],
    ['missing', { ...base, diff: { ...CLEAN, missing: ['a'] } }],
    [
      'unreadable',
      { ...base, diff: { ...CLEAN, unreadable: [{ rel: 'a', reason: 'r' }] } },
    ],
    ['hooks missing', { ...base, hooks: { status: 'missing', missing: [] } }],
    [
      'hooks unreadable',
      { ...base, hooks: { status: 'unreadable', missing: [] } },
    ],
    [
      'hooks project-absent',
      { ...base, hooks: { status: 'project-absent', missing: [] } },
    ],
  ] as const)('fails on %s', (_l, args) => {
    expect(strictFails(args as Parameters<typeof strictFails>[0])).toBe(true);
  });
  it('does not fail on local-only hooks', () => {
    expect(
      strictFails({
        ...base,
        hooks: { status: 'local-only', missing: [], localOnly: [] },
      }),
    ).toBe(false);
  });
});

// Every character a terminal interprets, except the structural \n between lines.
// Built from code points so no such character sits in this source file.
const UNSAFE_RAW = new RegExp(
  `[\\x00-\\x09\\x0b-\\x1f\\x7f-\\x9f\\p{Cf}${String.fromCodePoint(0x2028, 0x2029)}]`,
  'u',
);

describe('serializeStatusReport', () => {
  const HOSTILE = [
    '\u001b[2J',
    '\u0085',
    String.fromCodePoint(0x202e),
    String.fromCodePoint(0x200b),
    String.fromCodePoint(0x2028),
    String.fromCodePoint(0x2029),
    '\u{e0041}',
    '\u0007',
  ].join('');
  const hostileReport = () =>
    buildStatusReport(
      input({
        config: config({ skillsVersion: `1.0.0${HOSTILE}` }),
        drift: {
          diff: {
            modified: [`a${HOSTILE}`],
            missing: [`b${HOSTILE}`],
            unreadable: [{ rel: `c${HOSTILE}`, reason: `r${HOSTILE}` }],
            okCount: 1,
          },
          hooks: {
            status: 'missing',
            missing: [
              {
                event: 'Stop',
                matcher: HOSTILE,
                command: `node${HOSTILE}`,
                args: [HOSTILE],
              },
            ],
          },
          unknown: [
            { name: HOSTILE, role: 'lens', subtree: HOSTILE, reason: HOSTILE },
          ],
        },
      }),
    );

  it('emits no terminal-interpreted character, only \\u escapes', () => {
    const out = serializeStatusReport(hostileReport());
    expect(out).not.toMatch(UNSAFE_RAW);
    expect(out).toContain('\\u001b');
    expect(out).toContain('\\u202e');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\udb40');
  });

  it('round-trips: parsing returns the exact original strings', () => {
    const report = hostileReport();
    expect(JSON.parse(serializeStatusReport(report))).toEqual(
      JSON.parse(JSON.stringify(report)),
    );
  });

  it('keeps the pretty-printed structure (newlines are structural, not escaped)', () => {
    const out = serializeStatusReport(buildStatusReport(input()));
    expect(out.split('\n').length).toBeGreaterThan(10);
    expect(out).not.toContain('\\u000a');
    expect(JSON.parse(out).schemaVersion).toBe(1);
  });
});
