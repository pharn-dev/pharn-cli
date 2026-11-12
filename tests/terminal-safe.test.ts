import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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

// A static check that the set stays ONE: no other src/ file may spell a
// control-character range or a Cf/Cc class. It reads source spellings, so it
// catches the forms this repo has used (`\x00-\x1f`, `\x7f-\x9f`, their
// `\u00NN` and `\u{NN}` twins, `\p{Cf}`/`\p{Cc}` inside a class) — not every
// conceivable way to build a set. The one exemption is capability-index.ts's
// DISPLACED_LEAD_RE, a literal port of pharn-oss's fence rule, not a sanitizer.
describe('no second unsafe-character definition in src/', () => {
  const ROOT = join(import.meta.dirname, '..', 'src');
  const OWNER = join(ROOT, 'lib', 'terminal-safe.ts');
  const EXEMPT_FILE = join(ROOT, 'lib', 'capability-index.ts');
  const EXEMPT_LITERAL = 'const DISPLACED_LEAD_RE = /^[\\s\\p{Cf}]+(?=---)/u;';

  // `\x00-\x1f`, `\u0000-\u001f`, `\u{0}-\u{1f}`, with one or two backslashes
  // (a regex literal or a string passed to `new RegExp`), any range that
  // starts in C0 or at DEL/C1.
  const CONTROL_RANGE =
    /\\{1,2}(?:x[0-9a-f]{2}|u00[0-9a-f]{2}|u\{[0-9a-f]{1,2}\})-\\{1,2}(?:x|u00|u\{)/i;
  // `\p{Cf}` / `\p{Cc}` inside a character class (a comment naming the
  // category is not a definition).
  const CATEGORY_CLASS = /\[[^\]\n]*\\{1,2}p\{C[cf]\}/;
  const defines = (text: string): boolean =>
    CONTROL_RANGE.test(text) || CATEGORY_CLASS.test(text);

  function* tsFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* tsFiles(path);
      else if (entry.name.endsWith('.ts')) yield path;
    }
  }

  it.each([
    [
      'the old terminalSafe literal',
      String.raw`/[\x00-\x1f\x7f-\x9f\p{Cf}]/gu`,
    ],
    ['the old keep-whitespace literal', String.raw`/[\x00-\x08\x0b-\x1f]/gu`],
    ['CONTROL_CHARS_RE', String.raw`/[\x7f-\x9f]/`],
    ['a RegExp string', String.raw`new RegExp('[\\x00-\\x1f]')`],
    ['a \\u00NN range', String.raw`/[\u0000-\u001f]/`],
    ['a \\u{NN} range', String.raw`/[\u{0}-\u{1f}]/u`],
    ['a bare Cf class', String.raw`/[\p{Cf}]/u`],
    ['a Cc class', String.raw`/[\p{Cc}]/u`],
  ])('the detector catches %s', (_label, text) => {
    expect(defines(text)).toBe(true);
  });

  it('the detector spares a comment that only names the category', () => {
    expect(defines('// `\\p{Cf}` covers U+200B')).toBe(false);
  });

  it('only terminal-safe.ts defines the set (DISPLACED_LEAD_RE exempt)', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(ROOT)) {
      if (file === OWNER) continue;
      let text = readFileSync(file, 'utf8');
      if (file === EXEMPT_FILE) {
        // The exemption must stay exact, so it cannot quietly cover more.
        expect(text).toContain(EXEMPT_LITERAL);
        text = text.replace(EXEMPT_LITERAL, '');
      }
      if (defines(text)) offenders.push(relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});
