import { describe, expect, it } from 'vitest';
import {
  escapeUnsafe,
  hasUnsafeChars,
  terminalSafe,
} from '../src/lib/terminal-safe.js';

// Code points, not raw characters, so no control byte sits in this source.
const ESC = '\u001b';
const BEL = '\u0007';
const CSI_C1 = '\u009b';
const RLO = '\u202e';
const ZWSP = '\u200b';
const LS = String.fromCodePoint(0x2028);
const PS = String.fromCodePoint(0x2029);

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

describe('escapeUnsafe', () => {
  it('turns every terminal-interpreted character into a \\u escape', () => {
    const out = escapeUnsafe(`a${ESC}[2Kb${RLO}c${ZWSP}d${LS}e${PS}f\u0085`);
    expect(out).toBe('a\\u001b[2Kb\\u202ec\\u200bd\\u2028e\\u2029f\\u0085');
  });

  it('escapes an astral format character as its surrogate pair', () => {
    expect(escapeUnsafe('x\u{e0041}y')).toBe('x\\udb40\\udc41y');
  });

  it('leaves printable text, including non-ASCII letters, untouched', () => {
    expect(escapeUnsafe('plain é 日本 text')).toBe('plain é 日本 text');
  });
});

// ---------------------------------------------------------------------------
// CORE-170: ONE unsafe-character set — C0, DEL, C1, every Unicode format
// character (Cf: bidi controls, zero-width characters) and the two line
// separators — and all three functions read it. Before, `terminalSafe` and
// `hasUnsafeChars` lacked U+2028/2029 while `escapeUnsafe` had them.
// ---------------------------------------------------------------------------

describe('the one unsafe set', () => {
  const members: [string, string][] = [
    ['NUL (C0 start)', '\u0000'],
    ['ESC', ESC],
    ['US (C0 end)', '\u001f'],
    ['DEL', '\u007f'],
    ['PAD (C1 start)', '\u0080'],
    ['C1 CSI', CSI_C1],
    ['APC (C1 end)', '\u009f'],
    ['RLO', RLO],
    ['LRI', '\u2066'],
    ['ZWSP', ZWSP],
    ['BOM', '\ufeff'],
    ['LINE SEPARATOR', LS],
    ['PARAGRAPH SEPARATOR', PS],
    ['an astral tag character', '\u{e0041}'],
  ];

  it.each(members)('%s is stripped, tested and escaped', (_label, ch) => {
    expect(terminalSafe(`a${ch}b`)).toBe('ab');
    expect(terminalSafe(`a${ch}b`, { keepNewlines: true })).toBe('ab');
    expect(hasUnsafeChars(`a${ch}b`)).toBe(true);
    const escaped = escapeUnsafe(`a${ch}b`);
    expect(escaped).toMatch(/^a(\\u[0-9a-f]{4})+b$/);
    expect(hasUnsafeChars(escaped)).toBe(false);
  });

  it.each([
    ['space', ' '],
    ['tilde', '~'],
    ['NBSP (U+00A0, just past C1)', '\u00a0'],
    ['an em dash', '—'],
  ])('%s is not in the set', (_label, ch) => {
    expect(terminalSafe(`a${ch}b`)).toBe(`a${ch}b`);
    expect(hasUnsafeChars(`a${ch}b`)).toBe(false);
    expect(escapeUnsafe(`a${ch}b`)).toBe(`a${ch}b`);
  });

  it('keepNewlines spares exactly tab and LF', () => {
    expect(terminalSafe('a\tb\nc\rd\u000be', { keepNewlines: true })).toBe(
      'a\tb\ncde',
    );
    expect(terminalSafe('a\tb\nc')).toBe('abc');
  });

  it('escapeUnsafe is idempotent, so escaping an escaped message twice is safe', () => {
    const once = escapeUnsafe(`x${CSI_C1}${RLO}${ESC}[31m`);
    expect(escapeUnsafe(once)).toBe(once);
  });
});
