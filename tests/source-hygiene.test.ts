import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// No file under src/ or tests/ may hold a raw INVISIBLE character: a C0 control
// other than tab, LF and CR; DEL or a C1 control; a Unicode format character
// (Cf — bidi overrides, zero-width characters, the byte-order mark); or a line /
// paragraph separator. An editor and a diff view show nothing there, so the
// character a test is about (or an attack) cannot be told from no character at
// all. Tests spell such characters as escapes instead. Two slipped through
// before this check existed: a BOM in a tar-name test (#218) and a
// right-to-left override in plan D's files.
//
// The class is built from escapes and code points, so this file passes its own
// check — the same construction lib/hook-wiring.ts uses for its display escape.
// ---------------------------------------------------------------------------

const RAW_INVISIBLE = new RegExp(
  `[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f\\p{Cf}${String.fromCodePoint(0x2028, 0x2029)}]`,
  'u',
);

const ROOT = join(import.meta.dirname, '..');

function* filesUnder(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    else if (entry.isFile()) yield path;
  }
}

// Every raw invisible character in `text`, as `line:column U+XXXX`.
function offenders(text: string): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, i) => {
    [...line].forEach((ch, j) => {
      if (RAW_INVISIBLE.test(ch)) {
        const hex = ch.codePointAt(0)!.toString(16).toUpperCase();
        found.push(`${i + 1}:${j + 1} U+${hex.padStart(4, '0')}`);
      }
    });
  });
  return found;
}

describe('source hygiene — no raw invisible characters', () => {
  it.each(['src', 'tests'])('%s/ holds none', (dir) => {
    const hits = [...filesUnder(join(ROOT, dir))].flatMap((file) =>
      offenders(readFileSync(file, 'utf8')).map(
        (at) => `${relative(ROOT, file)}:${at}`,
      ),
    );
    expect(hits).toEqual([]);
  });

  // The class itself, so a check that matched nothing could not pass: every
  // kind it names is caught, and the ordinary whitespace it spares is spared.
  it.each([
    ['NUL', 0x00],
    ['BEL', 0x07],
    ['ESC', 0x1b],
    ['DEL', 0x7f],
    ['CSI (C1)', 0x9b],
    ['zero-width space', 0x200b],
    ['right-to-left override', 0x202e],
    ['byte-order mark', 0xfeff],
    ['line separator', 0x2028],
    ['paragraph separator', 0x2029],
  ])('catches %s', (_label, cp) => {
    expect(offenders(`ok${String.fromCodePoint(cp)}ok`)).toEqual([
      `1:3 U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
    ]);
  });

  it('spares tab, LF, CR and ordinary non-ASCII text', () => {
    expect(offenders('a\tb\r\nc — é → ✓ …')).toEqual([]);
  });
});
