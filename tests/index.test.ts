import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

const runInit = vi.fn(async () => undefined);
const runAdd = vi.fn(async (_arg?: string) => undefined);
const runUpdate = vi.fn(async () => undefined);
vi.mock('../src/commands/init.js', () => ({ runInit }));
vi.mock('../src/commands/add.js', () => ({ runAdd }));
vi.mock('../src/commands/update.js', () => ({ runUpdate }));

// Importing the module does not auto-run main(): under vitest, argv[1] is the
// test runner, not this module, so the isEntryPoint() guard is false.
const { main } = await import('../src/index.js');

function setArgv(...args: string[]): void {
  process.argv = ['node', '/path/to/index.js', ...args];
}

describe('main (argv dispatch)', () => {
  stubProcessExit();
  const realArgv = process.argv;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.argv = realArgv;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('defaults to init when no command is given', async () => {
    setArgv();
    await main();
    expect(runInit).toHaveBeenCalledTimes(1);
    expect(runAdd).not.toHaveBeenCalled();
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it('routes `add <arg>` to runAdd with the argument', async () => {
    setArgv('add', 'orm:prisma');
    await main();
    expect(runAdd).toHaveBeenCalledWith('orm:prisma');
  });

  it('routes `update` to runUpdate', async () => {
    setArgv('update');
    await main();
    expect(runUpdate).toHaveBeenCalledTimes(1);
  });

  it('prints the version for --version and runs no command', async () => {
    setArgv('--version');
    await main();
    expect(logSpy).toHaveBeenCalledWith(expect.any(String));
    expect(runInit).not.toHaveBeenCalled();
  });

  it('prints usage for --help and runs no command', async () => {
    setArgv('--help');
    await main();
    const printed = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0] ?? ''))
      .join('\n');
    expect(printed).toContain('Usage:');
    expect(runInit).not.toHaveBeenCalled();
  });

  it('exits(1) on an unknown command', async () => {
    setArgv('bogus');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(errSpy).toHaveBeenCalled();
    expect(runInit).not.toHaveBeenCalled();
  });
});
