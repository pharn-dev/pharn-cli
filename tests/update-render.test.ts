import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateOutcome } from '../src/lib/update-render.js';
import type { UpdatePlanReport } from '../src/lib/update-plan.js';
import type { ModelsUpdate } from '../src/lib/models-update.js';
import type { PharnConfig } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
}));

const prompts = await import('@clack/prompts');
const {
  executableUnitLines,
  reportExecutableUnit,
  reportOutcome,
  reportDryRun,
} = await import('../src/lib/update-render.js');

const ESC = String.fromCharCode(27);

describe('executableUnitLines — the EXECUTABLE UNIT note', () => {
  const hold = {
    blocking: [
      { rel: 'pharn/floor/reconcile-baseline.mjs', label: 'modified' as const },
      { rel: '.claude/hooks/h.cjs', label: 'unreadable' as const },
    ],
    held: ['pharn/floor/a.mjs', 'pharn/floor/b.mjs', 'pharn/floor/c.mjs'],
  };

  it('is null when nothing was held', () => {
    expect(executableUnitLines(null, false)).toBeNull();
    expect(executableUnitLines(null, true)).toBeNull();
  });

  it('names each blocker with its label, the held count and the --force remedy', () => {
    const text = executableUnitLines(hold, false)!.join('\n');
    expect(text).toContain('These unit files were skipped:');
    expect(text).toContain('  modified     pharn/floor/reconcile-baseline.mjs');
    expect(text).toContain('  unreadable   .claude/hooks/h.cjs');
    expect(text).toContain('So 3 other unit file(s) were not written either');
    expect(text).toContain(
      '`pharn update --force` (it backs them up to pharn/.backup/ first).',
    );
  });

  it('switches to the future tense for the preview', () => {
    const text = executableUnitLines(hold, true)!.join('\n');
    expect(text).toContain('These unit files would be skipped:');
    expect(text).toContain(
      'So 3 other unit file(s) would not be written either',
    );
    expect(text).not.toContain('were skipped');
  });

  it('caps the blocker list at 20 and counts the rest', () => {
    const many = {
      blocking: Array.from({ length: 23 }, (_, i) => ({
        rel: `pharn/floor/f${String(i).padStart(2, '0')}.mjs`,
        label: 'modified' as const,
      })),
      held: ['pharn/floor/new.mjs'],
    };
    const lines = executableUnitLines(many, false)!;
    expect(lines.filter((l) => l.startsWith('  modified '))).toHaveLength(20);
    expect(lines).toContain('  … and 3 more');
  });

  it('strips terminal control characters from a blocker path', () => {
    const text = executableUnitLines(
      {
        blocking: [{ rel: `pharn/floor/${ESC}[31mx.mjs`, label: 'modified' }],
        held: ['pharn/floor/y.mjs'],
      },
      false,
    )!.join('\n');
    expect(text).not.toContain(ESC);
  });

  it('prints one titled note on a hold and nothing without one', () => {
    reportExecutableUnit(null, false);
    expect(prompts.note).not.toHaveBeenCalled();
    reportExecutableUnit(hold, false);
    expect(prompts.note).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prompts.note).mock.calls[0]![1]).toBe('EXECUTABLE UNIT');
  });
});

// ---------------------------------------------------------------------------
// CORE-170: the records note quotes strings from the committed, hand-editable
// pharn.records.json (a key, the stamp) through JSON.stringify, which escapes
// ESC but leaves an 8-bit CSI (U+009B) and a bidi override (U+202E) raw. Both
// print sites escape the VALUE with escapeUnsafe; the ⚠ prefix stays theirs.
// ---------------------------------------------------------------------------

describe('the records note is escaped at both print sites', () => {
  const CSI = '\u009b';
  const RLO = '\u202e';
  const hostile = `pharn.records.json has an invalid hash for "pharn/x${CSI}2J${RLO}y${ESC}[31m.md"`;

  const models: ModelsUpdate = {
    outcome: 'ok',
    label: null,
    replacedLegacyDefault: false,
    next: undefined,
    nextRecord: null,
    backup: false,
    conversion: null,
    problems: [],
    upstreamReasons: [],
  };
  const counts = { updated: 0, restored: 0, ok: 3, forced: 0, skipped: 0 };

  const outcome: UpdateOutcome = {
    installedVersion: '1.0.0',
    recordedVersion: '1.0.0',
    capCount: 1,
    capabilityChanges: [],
    removals: [],
    plan: {
      files: [],
      writes: [],
      backups: [],
      skipped: [],
      counts,
      nextRecords: {},
      held: null,
    },
    backup: null,
    recordsNote: hostile,
    versionWithheld: false,
    abandonedLayout: null,
    featuresReadmeRelocation: false,
    models,
    modelsFloor: 'pharn/floor',
    orphans: [],
    rootMigration: null,
    rootMigrationResult: null,
  };

  const report: UpdatePlanReport = {
    gitignore: { action: 'none' },
    prettierignore: { action: 'none' },
    executableUnit: null,
    currentVersion: '1.0.0',
    installedVersion: '1.0.0',
    recordedVersion: '1.0.0',
    versionWithheld: false,
    pendingSkillsVersion: null,
    frozenCapabilities: [],
    capCount: 1,
    layout: 'pharn',
    abandonedLayout: null,
    featuresReadmeRelocation: false,
    capabilityChanges: [],
    removals: [],
    files: [],
    writes: [],
    backups: [],
    skipped: [],
    counts,
    models,
    modelsFloor: 'pharn/floor',
    hookWiring: { status: 'match', missing: [], localOnly: [] },
    absentUpstream: [],
    recordsNote: hostile,
    unknownWarning: null,
    unknownCapabilities: [],
    orphans: [],
    rootMigration: null,
    rootMoveBackups: [],
  };

  const warned = (): string =>
    vi
      .mocked(prompts.log.warn)
      .mock.calls.map(([m]) => String(m))
      .join('\n');

  beforeEach(() => {
    vi.mocked(prompts.log.warn).mockClear();
  });

  const expectEscaped = (text: string): void => {
    expect(text).toContain(
      '⚠ pharn.records.json has an invalid hash for "pharn/x\\u009b2J\\u202ey\\u001b[31m.md"',
    );
    expect(text).not.toContain(CSI);
    expect(text).not.toContain(RLO);
    expect(text).not.toContain(ESC);
  };

  it('reportOutcome (the real run)', () => {
    reportOutcome(outcome, false);
    expectEscaped(warned());
  });

  it('reportDryRun (the preview)', () => {
    reportDryRun(report, false, 'main', {} as PharnConfig);
    expectEscaped(warned());
  });
});
