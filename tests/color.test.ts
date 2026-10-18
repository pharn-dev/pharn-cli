import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PassThrough } from 'node:stream';
import { WriteStream } from 'node:tty';
import { log } from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { colorEnabled } from '../src/lib/color.js';

// ---------------------------------------------------------------------------
// F-28: one colour rule. pharn's own coloured text (lib/color.ts) and clack's
// chrome must agree on every environment, so a piped CI log never carries raw
// escape sequences from one of them while the other prints plain.
// ---------------------------------------------------------------------------

const COLOR_VARS = [
  'CI',
  'FORCE_COLOR',
  'NO_COLOR',
  'NODE_DISABLE_COLORS',
  'TERM',
] as const;

type ColorVars = Partial<Record<(typeof COLOR_VARS)[number], string>>;

// eslint-disable-next-line no-control-regex
const ESC = /\x1b\[/;

// A piped stdout: a writable that is not a terminal.
function pipe(): PassThrough {
  return new PassThrough();
}

// A colour terminal: a writable that says it is one, and reports its colour
// depth the way a real tty.WriteStream does; that method reads NO_COLOR,
// NODE_DISABLE_COLORS and TERM.
interface FakeTerminal extends PassThrough {
  isTTY: boolean;
  getColorDepth: typeof WriteStream.prototype.getColorDepth;
}
function terminal(): PassThrough {
  const s = new PassThrough() as FakeTerminal;
  s.isTTY = true;
  s.getColorDepth = WriteStream.prototype.getColorDepth;
  return s;
}

// A 256-colour terminal type, so the TTY cases do not depend on the runner.
const XTERM = ['xterm', '256color'].join('-');

// Exactly these colour variables, every other one unset.
function setColorVars(vars: ColorVars): void {
  const given = new Map(Object.entries(vars));
  for (const k of COLOR_VARS) vi.stubEnv(k, given.get(k));
}

beforeEach(() => setColorVars({ TERM: XTERM }));
afterEach(() => vi.unstubAllEnvs());

describe('colorEnabled, the one colour rule', () => {
  it('FORCE_COLOR 0 is off, on a pipe and on a terminal', () => {
    setColorVars({ FORCE_COLOR: '0', TERM: XTERM });
    expect(colorEnabled(pipe())).toBe(false);
    expect(colorEnabled(terminal())).toBe(false);
  });

  it('FORCE_COLOR false is off', () => {
    setColorVars({ FORCE_COLOR: 'false' });
    expect(colorEnabled(pipe())).toBe(false);
  });

  it('FORCE_COLOR 1 is on, even on a pipe', () => {
    setColorVars({ FORCE_COLOR: '1' });
    expect(colorEnabled(pipe())).toBe(true);
    expect(colorEnabled(terminal())).toBe(true);
  });

  it('NO_COLOR turns a terminal off', () => {
    setColorVars({ NO_COLOR: '1', TERM: XTERM });
    expect(colorEnabled(terminal())).toBe(false);
    expect(colorEnabled(pipe())).toBe(false);
  });

  it('CI with a piped stdout is off, though picocolors alone turned it on', () => {
    setColorVars({ CI: '1' });
    expect(colorEnabled(pipe())).toBe(false);
  });

  it('a colour terminal is on, a dumb one is off', () => {
    setColorVars({ TERM: XTERM });
    expect(colorEnabled(terminal())).toBe(true);
    setColorVars({ TERM: 'dumb' });
    expect(colorEnabled(terminal())).toBe(false);
  });

  it('a plain pipe with nothing set is off', () => {
    setColorVars({});
    expect(colorEnabled(pipe())).toBe(false);
  });
});

describe('lib/color.ts agrees with @clack/prompts', () => {
  afterEach(() => vi.resetModules());

  // The instance is decided at load, so each case loads it afresh; clack
  // decides on every call. Both are asked about the real process.stdout.
  it.each<ColorVars>([
    { FORCE_COLOR: '0' },
    { FORCE_COLOR: '0', CI: '1' },
    { FORCE_COLOR: '1' },
    { CI: '1' },
    { NO_COLOR: '1' },
    {},
  ])('%j: pharn colours exactly when clack does', async (vars) => {
    setColorVars(vars);
    vi.resetModules();
    const { default: pc } = await import('../src/lib/color.js');
    const out = new PassThrough();
    let clackText = '';
    out.on('data', (b: Buffer) => (clackText += b.toString()));
    log.message('x', { output: out as unknown as NodeJS.WriteStream });
    expect(ESC.test(pc.red('x'))).toBe(ESC.test(clackText));
  });

  it('FORCE_COLOR 0 under CI leaves no escape', async () => {
    setColorVars({ FORCE_COLOR: '0', CI: '1' });
    vi.resetModules();
    const { default: pc } = await import('../src/lib/color.js');
    expect(pc.cyan(pc.bold('x'))).toBe('x');
  });
});

describe('no other src/ file imports picocolors', () => {
  it('lib/color.ts is the only importer', () => {
    const srcDir = join(import.meta.dirname, '..', 'src');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return e.name.endsWith('.ts') ? [p] : [];
      });
    const importer =
      /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"]picocolors['"]/;
    const offenders = walk(srcDir)
      .filter((f) => importer.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcDir, f));
    expect(offenders).toEqual([join('lib', 'color.ts')]);
  });
});
