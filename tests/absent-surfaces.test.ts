import { describe, expect, it } from 'vitest';
import { absentSurfaceLines } from '../src/lib/absent-surfaces.js';

describe('absentSurfaceLines', () => {
  it('is null when nothing is absent — no report at all', () => {
    expect(absentSurfaceLines([])).toBeNull();
  });

  it('names each absent surface by path and kind, then the consequence and the lever', () => {
    const lines = absentSurfaceLines([
      { surface: 'hooks', path: '.claude/hooks' },
      { surface: 'contracts', path: 'pharn/pharn-contracts' },
    ]);
    expect(lines).toEqual([
      'pharn-oss ships nothing at these paths, so pharn did not install them:',
      '  .claude/hooks (hooks)',
      '  pharn/pharn-contracts (contracts)',
      'Installed commands, hooks and checkers that use them will not find them.',
      'If pharn-oss moved them, a newer pharn may know where:',
      '  npm i -g @pharn-dev/pharn@latest',
    ]);
  });

  it('renders a path terminal-safe (no control characters reach the terminal)', () => {
    const lines = absentSurfaceLines([
      { surface: 'floor', path: 'pharn/fl\u001b[31moor' },
    ]);
    expect(lines?.[1]).toBe('  pharn/fl[31moor (floor)');
  });
});
