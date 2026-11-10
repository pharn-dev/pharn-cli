import { describe, expect, it, vi } from 'vitest';

vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  note: vi.fn(),
  outro: vi.fn(),
}));

const prompts = await import('@clack/prompts');
const { executableUnitLines, reportExecutableUnit } =
  await import('../src/lib/update-render.js');

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
