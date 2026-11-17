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
  forcedOverwriteSections,
  noChangeVerdict,
  reportExecutableUnit,
  reportForcedOverwrites,
  reportOutcome,
  reportDryRun,
  reportBackup,
  withheldVersionLine,
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

  // CORE-159: a held unit file that is not on disk stays missing until the
  // hold ends (a deleted hook stays off) — the note names it.
  it('names the held files that are not on disk, in both tenses', () => {
    const withMissing = { ...hold, missing: ['.claude/hooks/guard.cjs'] };
    const text = executableUnitLines(withMissing, false)!.join('\n');
    expect(text).toContain(
      'Of those, these are not on disk, so they stay missing until the hold ends:',
    );
    expect(text).toContain('  .claude/hooks/guard.cjs');
    const preview = executableUnitLines(withMissing, true)!.join('\n');
    expect(preview).toContain(
      'Of those, these are not on disk, so they would stay missing until the hold ends:',
    );
  });

  it('prints no missing block without missing files (the 0.18.0 lines)', () => {
    const text = executableUnitLines(hold, false)!.join('\n');
    expect(text).not.toContain('not on disk');
  });

  it('caps the missing list and strips control characters from it', () => {
    const lines = executableUnitLines(
      {
        ...hold,
        missing: [
          `.claude/hooks/${ESC}[31mx.cjs`,
          ...Array.from({ length: 21 }, (_, i) => `.claude/hooks/m${i}.cjs`),
        ],
      },
      false,
    )!;
    expect(lines.join('\n')).not.toContain(ESC);
    expect(lines).toContain('  … and 2 more');
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
    next: undefined,
    nextRecord: null,
    backup: false,
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
    featuresReadmeRelocation: false,
    models,
    modelsFloor: 'pharn/floor',
    orphans: [],
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
    stateChanges: { config: false, records: false },
    changesNothing: true,
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

  // CORE-162: the same verdict closes both reports of a plan that changes
  // nothing, in place of the counts summary / "Run pharn update to apply".
  it('an unchanged outcome and a changes-nothing preview both end with the verdict', () => {
    vi.mocked(prompts.outro).mockClear();
    reportOutcome({ ...outcome, unchanged: true }, false);
    const real = String(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0]);
    expect(real).toContain('Up to date.');
    expect(real).not.toContain('✔');
    reportDryRun(report, false, 'main', {} as PharnConfig);
    const preview = String(vi.mocked(prompts.outro).mock.calls.at(-1)?.[0]);
    expect(preview).toContain('Dry run — Up to date.');
    expect(preview).not.toContain('to apply');
  });
});

// CORE-162: the WOULD OVERWRITE sections, shared by the dry run (`WOULD`) and
// the real run's note before its confirm (`WILL`).
describe('forcedOverwriteSections — what --force overwrites', () => {
  const file = (
    rel: string,
    label: 'modified' | 'unrecorded' | 'unverifiable' | 'updated',
    forced: boolean,
  ) => ({
    rel,
    action: 'write' as const,
    label,
    backup: forced,
    forced,
  });
  const files = [
    file('a.md', 'modified', true),
    file('b.md', 'unrecorded', true),
    file('c.md', 'unverifiable', true),
    file('d.md', 'updated', false),
  ];
  const models = (backup: boolean) => ({ backup }) as ModelsUpdate;

  it('groups the forced writes by label and leaves out clean upgrades', () => {
    expect(
      forcedOverwriteSections({ files, models: models(false) }, 'WILL'),
    ).toEqual([
      { heading: 'WILL OVERWRITE (--force) — modified', rels: ['a.md'] },
      { heading: 'WILL OVERWRITE (--force) — unrecorded', rels: ['b.md'] },
      { heading: 'WILL OVERWRITE (--force) — unverifiable', rels: ['c.md'] },
    ]);
  });

  it('adds pharn.config.json when the models block is backed up', () => {
    const sections = forcedOverwriteSections(
      { files: [], models: models(true) },
      'WOULD',
    );
    expect(sections).toEqual([
      {
        heading: 'WOULD OVERWRITE (--force) — your models block',
        rels: ['pharn.config.json'],
      },
    ]);
  });

  it('reportForcedOverwrites prints one OVERWRITE note, and none when nothing is forced', () => {
    vi.mocked(prompts.note).mockClear();
    reportForcedOverwrites({ files: [], models: models(false), backups: [] });
    expect(prompts.note).not.toHaveBeenCalled();
    reportForcedOverwrites({
      files,
      models: models(true),
      backups: ['a.md', 'b.md', 'c.md', 'pharn.config.json'],
    });
    const [body, title] = vi.mocked(prompts.note).mock.calls[0]!;
    expect(title).toBe('OVERWRITE');
    expect(String(body)).toContain('WILL OVERWRITE (--force) — modified');
    expect(String(body)).toContain('  a.md');
    expect(String(body)).toContain('  pharn.config.json');
    expect(String(body)).not.toContain('d.md');
  });
});

describe('noChangeVerdict — the closing words of a run that changes nothing', () => {
  const counts = (skipped: number) => ({
    updated: 0,
    restored: 0,
    ok: 3,
    forced: 0,
    skipped,
  });

  it('is "Up to date." only with nothing skipped and the version recorded', () => {
    expect(
      noChangeVerdict({
        counts: counts(0),
        recordedVersion: '2.0.0',
        installedVersion: '2.0.0',
      }),
    ).toBe('Up to date.');
  });

  it('is "Nothing to change." with a skip, or a withheld version', () => {
    expect(
      noChangeVerdict({
        counts: counts(1),
        recordedVersion: '2.0.0',
        installedVersion: '2.0.0',
      }),
    ).toBe('Nothing to change.');
    expect(
      noChangeVerdict({
        counts: counts(0),
        recordedVersion: '1.0.0',
        installedVersion: '2.0.0',
      }),
    ).toBe('Nothing to change.');
  });
});

// CORE-163: the withheld-version warning may speak of finishing an upgrade only
// when there IS one — the clone is a newer skills version than the install.
describe('withheldVersionLine', () => {
  const base = {
    skipped: 2,
    recordedVersion: '1.0.0',
    installedVersion: '1.1.0',
    forceable: true,
    preview: false,
  };

  it('keeps the upgrade wording when the version is withheld', () => {
    expect(withheldVersionLine(base)).toBe(
      '2 file(s) were skipped, so your install is still recorded as skills v1.0.0 (upstream is v1.1.0) — resolve them, or re-run with --force, to finish the upgrade.',
    );
    expect(withheldVersionLine({ ...base, preview: true })).toBe(
      '2 file(s) would be skipped, so your install would stay recorded as skills v1.0.0 (upstream is v1.1.0) — resolve them, or run with --force, to finish the upgrade.',
    );
    expect(withheldVersionLine({ ...base, forceable: false })).toBe(
      '2 file(s) were skipped, so your install is still recorded as skills v1.0.0 (upstream is v1.1.0) — resolve them to finish the upgrade.',
    );
  });

  it('says there is no upgrade to finish at the current version', () => {
    const same = { ...base, recordedVersion: '1.1.0' };
    expect(withheldVersionLine(same)).toBe(
      '2 file(s) were skipped; your install is already at skills v1.1.0, so there is no upgrade to finish — re-run with --force to overwrite them (backed up to pharn/.backup/ first), or keep them as they are.',
    );
    expect(withheldVersionLine({ ...same, preview: true })).toBe(
      '2 file(s) would be skipped; your install is already at skills v1.1.0, so there is no upgrade to finish — run with --force to overwrite them (backed up to pharn/.backup/ first), or keep them as they are.',
    );
  });

  it('names no --force at the current version when nothing it can clear was skipped', () => {
    const line = withheldVersionLine({
      ...base,
      recordedVersion: '1.1.0',
      forceable: false,
    });
    expect(line).toBe(
      '2 file(s) were skipped; your install is already at skills v1.1.0, so there is no upgrade to finish — resolve them by hand.',
    );
    expect(line).not.toContain('--force');
  });
});

// The last lines of an update that failed after its backup: the command prints
// the fatal line, then this, then throws an already-reported CliError, so the
// pointer is never lost behind the exit.
describe('reportBackup — an aborted run names its backup on stderr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says the run stopped part-way and points at the backup, all on stderr', () => {
    reportBackup(
      {
        dir: 'pharn/.backup/2026-11-16T00-00-00Z',
        count: 2,
        action: 'overwriting and removing',
        gitignored: true,
      },
      { aborted: true },
    );
    expect(vi.mocked(prompts.log.warn).mock.calls).toEqual([
      [
        'The update stopped part-way — some originals may already have been overwritten or removed.',
        { output: process.stderr },
      ],
    ]);
    const infos = vi.mocked(prompts.log.info).mock.calls;
    expect(infos.length).toBeGreaterThan(0);
    for (const [, opts] of infos)
      expect(opts).toEqual({ output: process.stderr });
    expect(infos.map(([line]) => String(line)).join('\n')).toContain(
      'pharn/.backup/2026-11-16T00-00-00Z',
    );
  });
});
