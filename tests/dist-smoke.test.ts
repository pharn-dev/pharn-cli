import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Executes the SHIPPED artifact — the esbuild bundle — inside the required
// `Test` gate, which runs `test:coverage` and never `npm run build`. Every other
// suite imports `src/`, so a regression that exists only in the bundle
// (`src/version.ts`'s `require('../package.json')`, correct only at the bundle's
// depth below the package root; a name `scripts/build.mjs` leaves `external`
// that no longer resolves; the `isEntryPoint` auto-run) stayed green here.
//
// The bundle is built by `scripts/build.mjs` ITSELF, given a temp outdir — the
// same options `npm run build` uses, not a copy of them. It is placed where the
// published package puts it: `<pkg>/dist/index.js` and its chunks beside a copy of
// `package.json`, with the externals resolvable from a `node_modules` above it
// (here a link to this repo's). Nothing is written inside the repo, and the
// child processes are invisible to coverage, which instruments `src/` in this
// process only.
//
// No test here reaches the network: `--version`/`--help` and the option
// refusal short-circuit before any command runs, and `status` stops at the
// missing config, before it resolves a source.

const ROOT = resolve(import.meta.dirname, '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
  bin: { pharn: string };
};

let tmp = '';
let bin = '';
let project = '';

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pharn-dist-smoke-'));
  const pkgDir = join(tmp, 'pkg');
  // The published bin path, not a literal: a renamed `bin.pharn` moves the
  // bundle here too, and `version.ts`'s relative lookup must still hold.
  bin = join(pkgDir, PKG.bin.pharn);
  const built = spawnSync(
    process.execPath,
    ['scripts/build.mjs', dirname(bin)],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (built.status !== 0) {
    throw new Error(
      `scripts/build.mjs failed (exit ${built.status}):\n${built.stderr}`,
    );
  }
  copyFileSync(join(ROOT, 'package.json'), join(pkgDir, 'package.json'));
  symlinkSync(join(ROOT, 'node_modules'), join(pkgDir, 'node_modules'), 'dir');
  project = join(tmp, 'project');
  mkdirSync(project);
}, 60_000);

afterAll(() => {
  // `rmSync` removes the node_modules LINK, never the repo's node_modules.
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function pharn(
  args: string[],
  nodeArgs: string[] = [],
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  // Full error output would print a stack on purpose; the default must not.
  delete env.PHARN_DEBUG;
  const r = spawnSync(process.execPath, [...nodeArgs, bin, ...args], {
    cwd: project,
    encoding: 'utf8',
    timeout: 30_000,
    env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// A stack frame line (`    at fn (file:1:2)`) — what an uncaught throw prints.
const STACK_FRAME = /^\s+at .+/m;

// Every module URL the child resolves, one `LOADED <url>` line each on stderr,
// through a synchronous resolve hook preloaded with `--import`.
const TRACE_MODULES = [
  '--import',
  'data:text/javascript,import{registerHooks}from"node:module";registerHooks({resolve(s,c,n){const r=n(s,c);process.stderr.write("LOADED "+r.url+"\\n");return r;}});',
];

function loadedModules(stderr: string): string[] {
  return [...stderr.matchAll(/^LOADED (.+)$/gm)].map((m) => m[1]!);
}

// A command's chunk is named after its source file (`status-<hash>.js`).
const COMMAND_CHUNK =
  /\/dist\/(init|add|remove|update|list|status|uninstall)-[A-Z0-9]+\.js$/;

// Each test spawns a fresh node process; the per-test budget is the spawn's.
describe('the built bundle (dist/index.js)', { timeout: 30_000 }, () => {
  it('is built where the published package puts it', () => {
    expect(existsSync(bin)).toBe(true);
  });

  it('--version prints the package.json version and exits 0', () => {
    const r = pharn(['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(PKG.version);
    expect(r.stderr).toBe('');
  });

  it('--version loads neither @clack/prompts nor any command module', () => {
    const r = pharn(['--version'], TRACE_MODULES);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(PKG.version);
    const loaded = loadedModules(r.stderr);
    expect(loaded).toContain(pathToFileURL(realpathSync(bin)).href);
    expect(loaded.filter((u) => u.includes('@clack/prompts'))).toEqual([]);
    expect(loaded.filter((u) => COMMAND_CHUNK.test(u))).toEqual([]);
  });

  // The control for the case above: the trace sees a command chunk and clack
  // when a command does run, so their absence there is not a blind spot.
  it('a command loads its own chunk (and only that command)', () => {
    const r = pharn(['status'], TRACE_MODULES);
    expect(r.status).toBe(1);
    const commands = loadedModules(r.stderr).filter((u) =>
      COMMAND_CHUNK.test(u),
    );
    expect(commands.map((u) => COMMAND_CHUNK.exec(u)![1])).toEqual(['status']);
    expect(
      loadedModules(r.stderr).some((u) => u.includes('@clack/prompts')),
    ).toBe(true);
  });

  it('--help exits 0 and lists every command', () => {
    const r = pharn(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage:');
    for (const cmd of ['init', 'add', 'remove', 'update', 'list', 'status']) {
      expect(r.stdout).toMatch(new RegExp(`^ {2}${cmd}\\b`, 'm'));
    }
  });

  it('status with no pharn.config.json exits 1 with the "run init" message, no stack trace', () => {
    const r = pharn(['status']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(
      'No pharn.config.json found. Run `pharn init` first.',
    );
    expect(r.stderr).not.toMatch(STACK_FRAME);
    expect(r.stdout).not.toMatch(STACK_FRAME);
    expect(existsSync(join(project, 'pharn.config.json'))).toBe(false);
  });

  it('refuses an option the command does not take (exit 1)', () => {
    const r = pharn(['status', '--force']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Unsupported option for `status`: "--force"');
    expect(r.stdout).toBe('');
  });

  it('refuses an unknown option (exit 1)', () => {
    const r = pharn(['--bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Unknown option: "--bogus"');
    expect(r.stderr).toContain('Run `pharn --help` for usage.');
    expect(r.stderr).not.toContain('Usage:');
    expect(r.stdout).toBe('');
  });

  // The bundled parser declares `--no-drift` as its own option and allows no
  // other negation, so a negated boolean is an unknown option.
  it('refuses a negated option it does not declare (exit 1)', () => {
    const r = pharn(['--no-dry-run']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Unknown option: "--no-dry-run"');
    expect(r.stdout).toBe('');
  });

  it('`status --help` prints only that command page (exit 0)', () => {
    const r = pharn(['status', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('pharn status [options]');
    expect(r.stdout).toContain('--strict');
    expect(r.stdout).not.toContain('Commands:');
    expect(r.stdout).not.toContain('--force');
  });
});
