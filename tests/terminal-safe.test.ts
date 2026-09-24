import { describe, expect, it } from 'vitest';
import { hasUnsafeChars, terminalSafe } from '../src/lib/terminal-safe.js';

// Code points, not raw characters, so no control byte sits in this source.
const ESC = '\u001b';
const BEL = '\u0007';
const CSI_C1 = '\u009b';
const RLO = '‮';
const ZWSP = '​';

describe('terminalSafe (PHARN-17)', () => {
  it.each([
    ['an ESC/CSI sequence', `a${ESC}[2K${ESC}[32mOK`, 'a[2K[32mOK'],
    [
      'an OSC 52 clipboard write',
      `x${ESC}]52;c;ZXZpbA==${BEL}y`,
      'x]52;c;ZXZpbA==y',
    ],
    ['a C1 CSI', `a${CSI_C1}31mb`, 'a31mb'],
    ['a right-to-left override', `evil${RLO}gnp.exe`, 'evilgnp.exe'],
    ['a zero-width space', `se${ZWSP}curity`, 'security'],
    ['a carriage return and newline', 'a\rb\nc\td', 'abcd'],
  ])('strips %s', (_label, input, expected) => {
    expect(terminalSafe(input)).toBe(expected);
    expect(hasUnsafeChars(terminalSafe(input))).toBe(false);
  });

  it('keeps newlines and tabs on request, still stripping the rest', () => {
    expect(terminalSafe(`a\nb\tc\r${ESC}d`, { keepNewlines: true })).toBe(
      'a\nb\tcd',
    );
  });

  it('caps the length after stripping', () => {
    expect(terminalSafe('x'.repeat(10), { max: 4 })).toBe('xxxx…');
    expect(terminalSafe('xxxx', { max: 4 })).toBe('xxxx');
  });

  it('leaves ordinary non-ASCII text alone', () => {
    expect(terminalSafe('café — naïve')).toBe('café — naïve');
    expect(hasUnsafeChars('café — naïve')).toBe(false);
  });

  it('hasUnsafeChars is stable across calls (no /g lastIndex carry-over)', () => {
    expect(hasUnsafeChars(`a${ESC}`)).toBe(true);
    expect(hasUnsafeChars(`a${ESC}`)).toBe(true);
    expect(hasUnsafeChars(RLO)).toBe(true);
  });
});
