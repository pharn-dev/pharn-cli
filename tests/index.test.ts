import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/lib/cli-args.js';
import { PHARN_VERSION } from '../src/version.js';
import { stubProcessExit } from './helpers.js';
// Importing the module does not auto-run main(): under vitest, argv[1] is the
// test runner, not this module, so the isEntryPoint() guard is false. Nor does
// it load a command: main() imports the one it dispatches to.
import { main } from '../src/index.js';

// `main()` is the CLI's one boundary: it parses argv (tests/cli-args.test.ts
// covers every parse), then prints, refuses or dispatches. The command modules
// are the only thing replaced, so each dispatch is observed as a call.
const runInit = vi.fn(async (_opts: unknown) => undefined);
const runAdd = vi.fn(async (_arg?: string) => undefined);
const runRemove = vi.fn(async (_arg?: string) => undefined);
const runUpdate = vi.fn(async (_opts: unknown) => undefined);
const runList = vi.fn(async (_opts: unknown) => undefined);
const runStatus = vi.fn(async (_opts: unknown) => undefined);
const runUninstall = vi.fn(async (_opts: unknown) => undefined);
const runVerifyArchive = vi.fn(async (_opts: unknown) => undefined);
// Each command module's factory runs when, and only when, main() imports it:
// `loaded` names the command modules loaded since it was last emptied.
const loaded = vi.hoisted((): string[] => []);
vi.mock('../src/commands/init.js', () => (loaded.push('init'), { runInit }));
vi.mock('../src/commands/add.js', () => (loaded.push('add'), { runAdd }));
vi.mock(
  '../src/commands/remove.js',
  () => (loaded.push('remove'), { runRemove }),
);
vi.mock(
  '../src/commands/update.js',
  () => (loaded.push('update'), { runUpdate }),
);
vi.mock('../src/commands/list.js', () => (loaded.push('list'), { runList }));
vi.mock(
  '../src/commands/status.js',
  () => (loaded.push('status'), { runStatus }),
);
vi.mock(
  '../src/commands/uninstall.js',
  () => (loaded.push('uninstall'), { runUninstall }),
);
vi.mock(
  '../src/commands/verify-archive.js',
  () => (loaded.push('verify-archive'), { runVerifyArchive }),
);

const COMMANDS = {
  init: runInit,
  add: runAdd,
  remove: runRemove,
  update: runUpdate,
  list: runList,
  status: runStatus,
  uninstall: runUninstall,
  'verify-archive': runVerifyArchive,
};

function setArgv(...args: string[]): void {
  process.argv = ['node', '/path/to/index.js', ...args];
}

describe('main (argv dispatch)', () => {
  stubProcessExit();
  const realArgv = process.argv;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  const lines = (spy: ReturnType<typeof vi.spyOn>): string[] =>
    spy.mock.calls.map((c: unknown[]) => String(c[0] ?? ''));
  const noCommandRan = (): void => {
    for (const fn of Object.values(COMMANDS)) expect(fn).not.toHaveBeenCalled();
  };
  const run = async (...args: string[]): Promise<void> => {
    setArgv(...args);
    await main();
  };

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.argv = realArgv;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('loads no command for --version, --help or a refusal, and only the one it dispatches to', async () => {
    // A fresh registry, so a module an earlier case loaded loads again here.
    vi.resetModules();
    loaded.length = 0;
    setArgv('--version');
    await main();
    setArgv('status', '--help');
    await main();
    setArgv('status', '--force');
    await expect(main()).rejects.toMatchObject({
      name: 'CliError',
      exitCode: 1,
    });
    expect(loaded).toEqual([]);

    setArgv('list');
    await main();
    expect(loaded).toEqual(['list']);
    expect(runList).toHaveBeenCalledTimes(1);
    setArgv('rm', 'lens:x');
    await main();
    expect(loaded).toEqual(['list', 'remove']);
    expect(runRemove).toHaveBeenCalledWith('lens:x');
  });

  it.each([
    [[]],
    [['init', '--archetype', 'spa,backend', '--ref', 'main']],
    [['--json']],
    [['update', '--compact']],
    [['update', '--force', '-y']],
    [['list', '--json']],
    [['status', '--strict', '--no-drift']],
    [['uninstall', '-y']],
    [['verify-archive', 'a.tar.gz', '--expect-version', '7.25.5']],
  ])('hands %j to its command as one parsed options object', async (args) => {
    await run(...args);
    const parsed = parseCliArgs(args);
    if (parsed.kind !== 'run' || !('options' in parsed.invocation)) {
      throw new Error(`expected a run with options: ${JSON.stringify(parsed)}`);
    }
    const fn = COMMANDS[parsed.invocation.command];
    expect(fn.mock.calls).toEqual([[parsed.invocation.options]]);
    expect(lines(errSpy)).toEqual([]);
  });

  it.each([
    [['add', '123'], runAdd, '123'],
    [['add'], runAdd, undefined],
    [['remove', 'a11y'], runRemove, 'a11y'],
    [['rm', 'lens:n-plus-one'], runRemove, 'lens:n-plus-one'],
  ] as const)(
    'hands %j its one positional and nothing else',
    async (args, fn, arg) => {
      await run(...args);
      expect(fn.mock.calls).toEqual([[arg]]);
    },
  );

  it.each([
    [['status', '--sctrict'], 'Unknown option: "--sctrict"'],
    [['status', '--force'], 'Unsupported option for `status`: "--force"'],
    [['update', '--json=false'], 'Option takes no value: "--json=false"'],
    [
      ['init', '--ref', 'tip'],
      'Invalid value for --ref (expected "main" or "latest"): "tip"',
    ],
    [['bogus'], 'Unknown command: bogus'],
    [['add', 'a', 'b'], 'Unexpected argument: "b"'],
    [['--help', '--bogus'], 'Unknown option: "--bogus"'],
  ])(
    'refuses %j: one stderr line and the pointer, nothing on stdout, exit 1',
    async (args, message) => {
      // Already printed; the code reaches runCli as a CliError, never an exit.
      await expect(run(...args)).rejects.toMatchObject({
        name: 'CliError',
        exitCode: 1,
      });
      expect(process.exit).not.toHaveBeenCalled();
      expect(lines(errSpy)).toEqual([message, 'Run `pharn --help` for usage.']);
      expect(lines(logSpy)).toEqual([]);
      noCommandRan();
    },
  );

  it('prints the version for --version and runs nothing', async () => {
    await run('--version');
    expect(lines(logSpy)).toEqual([PHARN_VERSION]);
    noCommandRan();
  });

  it.each([[['--help']], [['status', '--help']]])(
    'prints the help for %j on stdout and runs nothing',
    async (args) => {
      await run(...args);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(lines(logSpy)[0]).toContain('Usage:');
      expect(lines(errSpy)).toEqual([]);
      noCommandRan();
    },
  );
});

// THE ONE EXIT POINT: `runCli` awaits `main()` and is the only catch for what a
// command throws. It prints through `reportCliError`, sets process.exitCode and
// resolves — never rejects, never calls process.exit.
const { runCli } = await import('../src/index.js');
// Looked up per test: an earlier case resets the module registry, and the
// error must be the class runCli's own (lazy) reporter will see.
const cliError = async () => (await import('../src/lib/cli-error.js')).CliError;

describe('runCli (the one exit point)', () => {
  stubProcessExit();
  const realArgv = process.argv;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.stubEnv('PHARN_DEBUG', '');
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.argv = realArgv;
    process.exitCode = undefined;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });
  const stderr = (): string =>
    errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  it('leaves the exit code unset when the command returns', async () => {
    setArgv('list');
    await expect(runCli()).resolves.toBeUndefined();
    expect(runList).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('sets exit code 0 for a cancel, and resolves', async () => {
    runInit.mockRejectedValueOnce((await cliError()).cancel());
    setArgv('init');
    await expect(runCli()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(0);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('sets exit code 1 for a refusal and prints its one line', async () => {
    runStatus.mockRejectedValueOnce(
      (await cliError()).refusal('Locked by another run.', { json: true }),
    );
    setArgv('status', '--json');
    await expect(runCli()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toBe('⚠ Locked by another run.');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('turns an unexpected Error into exit 1 with no stack trace', async () => {
    runUpdate.mockRejectedValueOnce(new TypeError('x is undefined'));
    setArgv('update');
    await expect(runCli()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('⚠ x is undefined');
    expect(stderr()).toContain('PHARN_DEBUG=1');
    expect(stderr()).not.toMatch(/^\s+at .+/m);
  });
});
