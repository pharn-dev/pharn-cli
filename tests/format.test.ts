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
});
