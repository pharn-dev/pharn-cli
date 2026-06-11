import { describe, expect, it } from 'vitest';
import { row, shortDescription } from '../src/lib/format.js';

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

describe('shortDescription', () => {
  it('keeps "Next.js" intact — does not split on a bare period', () => {
    expect(shortDescription('Next.js + Supabase + Better Auth + Vercel')).toBe(
      'Next.js + Supabase + Better Auth + Vercel',
    );
  });

  it('splits on an em-dash, semicolon, or sentence-ending period', () => {
    expect(shortDescription('First clause — second')).toBe('First clause');
    expect(shortDescription('First clause; second')).toBe('First clause');
    expect(shortDescription('First clause. Second sentence.')).toBe(
      'First clause',
    );
  });

  it('truncates to 80 chars with an ellipsis', () => {
    const long = 'x'.repeat(100);
    const result = shortDescription(long);
    expect(result).toHaveLength(78);
    expect(result.endsWith('…')).toBe(true);
  });
});
