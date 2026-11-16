import { describe, expect, it } from 'vitest';
import { row } from '../src/lib/format.js';

describe('row', () => {
  it('left-pads the label to a fixed column and appends the value', () => {
    expect(row('A', 'B')).toBe(`${'  A'.padEnd(28)}B`);
  });

  it('still appends the value when the label overflows the column', () => {
    const label = 'a-very-long-label-that-is-wider-than-the-column';
    const result = row(label, 'V');
    expect(result.startsWith(`  ${label}`)).toBe(true);
    expect(result.endsWith('V')).toBe(true);
  });

  // CORE-168: a label that fills or overflows the column used to run straight
  // into its value (`missing-error-handling (lens)universal`).
  it('keeps at least a two-space gap before the value, however long the label', () => {
    const label = 'missing-error-handling (lens)';
    expect(row(label, 'universal')).toBe(`  ${label}  universal`);
    const fills = 'x'.repeat(26); // `  ` + 26 = 28: zero gap before the fix
    expect(row(fills, 'V')).toBe(`  ${fills}  V`);
  });

  it('leaves a label that fits the column byte-identical', () => {
    const fits = 'y'.repeat(24);
    expect(row(fits, 'V')).toBe(`${`  ${fits}`.padEnd(28)}V`);
    expect(row(fits, 'V').length).toBe(29);
  });
});
