import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

const runInit = vi.fn(async () => undefined);
const runAdd = vi.fn(async (_arg?: string) => undefined);
const runRemove = vi.fn(
  async (_arg?: string, _opts?: { yes?: boolean }) => undefined,
);
const runUpdate = vi.fn(async () => undefined);
const runList = vi.fn(async (_opts?: { json?: boolean }) => undefined);
const runStatus = vi.fn(
  async (_opts?: { strict?: boolean; drift?: boolean }) => undefined,
);
vi.mock('../src/commands/init.js', () => ({ runInit }));
vi.mock('../src/commands/add.js', () => ({ runAdd }));
vi.mock('../src/commands/remove.js', () => ({ runRemove }));
vi.mock('../src/commands/update.js', () => ({ runUpdate }));
vi.mock('../src/commands/list.js', () => ({ runList }));
vi.mock('../src/commands/status.js', () => ({ runStatus }));

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
    expect(runInit).toHaveBeenCalledWith();
    expect(runAdd).not.toHaveBeenCalled();
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it('accepts `init --archetype` as a no-op alias (archetype is now the default)', async () => {
    setArgv('init', '--archetype');
    await main();
    expect(runInit).toHaveBeenCalledTimes(1);
    expect(runInit).toHaveBeenCalledWith();
  });

  it('routes `add <arg>` to runAdd with the argument', async () => {
    setArgv('add', 'lens:n-plus-one');
    await main();
    expect(runAdd).toHaveBeenCalledWith('lens:n-plus-one');
  });

  it('routes `remove <arg>` to runRemove with the argument and yes:false', async () => {
    setArgv('remove', 'a11y');
    await main();
    expect(runRemove).toHaveBeenCalledWith('a11y', { yes: false });
  });

  it('passes yes:true through for `remove --yes`', async () => {
    setArgv('remove', 'a11y', '--yes');
    await main();
    expect(runRemove).toHaveBeenCalledWith('a11y', { yes: true });
  });

  it('routes the `rm` alias to runRemove', async () => {
    setArgv('rm', 'lens:n-plus-one');
    await main();
    expect(runRemove).toHaveBeenCalledWith('lens:n-plus-one', { yes: false });
  });

  it('routes `update` to runUpdate', async () => {
    setArgv('update');
    await main();
    expect(runUpdate).toHaveBeenCalledTimes(1);
  });

  it('routes `list` to runList with json:false by default', async () => {
    setArgv('list');
    await main();
    expect(runList).toHaveBeenCalledWith({ json: false });
  });

  it('routes `list --json` to runList with json:true', async () => {
    setArgv('list', '--json');
    await main();
    expect(runList).toHaveBeenCalledWith({ json: true });
  });

  it('routes `status` to runStatus with strict:false, drift:true by default', async () => {
    setArgv('status');
    await main();
    expect(runStatus).toHaveBeenCalledWith({ strict: false, drift: true });
  });

  it('passes strict:true through for `status --strict`', async () => {
    setArgv('status', '--strict');
    await main();
    expect(runStatus).toHaveBeenCalledWith({ strict: true, drift: true });
  });

  it('maps `status --no-drift` to drift:false', async () => {
    setArgv('status', '--no-drift');
    await main();
    expect(runStatus).toHaveBeenCalledWith({ strict: false, drift: false });
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
    // USAGE is synced to the capability model (grill F3) — no module wording.
    expect(printed).toMatch(/capabilit/i);
    expect(printed).not.toMatch(/methodology module|stack pack/i);
    expect(runInit).not.toHaveBeenCalled();
  });

  it('exits(1) on an unknown command', async () => {
    setArgv('bogus');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(errSpy).toHaveBeenCalled();
    expect(runInit).not.toHaveBeenCalled();
  });
});
