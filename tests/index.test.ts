import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

const runInit = vi.fn(async () => undefined);
const runAdd = vi.fn(async (_arg?: string) => undefined);
const runRemove = vi.fn(async (_arg?: string) => undefined);
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

  it('routes `remove <arg>` to runRemove with the argument alone', async () => {
    setArgv('remove', 'a11y');
    await main();
    expect(runRemove).toHaveBeenCalledWith('a11y');
  });

  // `remove` has NO `--yes`. Its named path never confirms, and the bare
  // picker's ONE destructive confirm is unconditional — there is nothing for a
  // flag to skip, so nothing is threaded into the command. The flag stays a
  // declared minimist boolean because it belongs to `update`: that is what
  // keeps `pharn remove --yes` PARSING (the unknown-option gate below must not
  // start refusing it) instead of exiting 1.
  it('accepts `remove --yes` and drops it — it is an update flag', async () => {
    setArgv('remove', 'a11y', '--yes');
    await main();
    expect(runRemove).toHaveBeenCalledWith('a11y');
    // The exact-arity check: `toHaveBeenCalledWith` already rejects an extra
    // argument, but this names the contract the dispatcher is being held to.
    expect(runRemove.mock.calls[0]).toHaveLength(1);
  });

  it('routes the `rm` alias to runRemove', async () => {
    setArgv('rm', 'lens:n-plus-one');
    await main();
    expect(runRemove).toHaveBeenCalledWith('lens:n-plus-one');
  });

  it('routes `update` to runUpdate with force:false, yes:false by default', async () => {
    setArgv('update');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({ force: false, yes: false });
  });

  it('passes force:true through for `update --force`', async () => {
    setArgv('update', '--force');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({ force: true, yes: false });
  });

  // `--yes` was parsed but dead before this: minimist listed it and only
  // `runRemove` took it — in a parameter it never read. That parameter is gone
  // (`remove` has no `--yes`), so this is the flag's ONE real consumer.
  it('passes yes:true through for `update --yes`', async () => {
    setArgv('update', '--yes');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({ force: false, yes: true });
  });

  it('accepts the -y alias for `update`', async () => {
    setArgv('update', '-y');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({ force: false, yes: true });
  });

  it('composes `update --yes --force` (the full CI re-apply)', async () => {
    setArgv('update', '--yes', '--force');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({ force: true, yes: true });
  });

  it('documents --yes as an update flag in the usage text', async () => {
    setArgv('--help');
    await main();
    const printed = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0] ?? ''))
      .join('\n');
    // Scoped to its command, like --force: `init` deliberately has no --yes.
    expect(printed).toMatch(/-y, --yes\s+update:/);
  });

  it('documents --force as an update flag in the usage text', async () => {
    setArgv('--help');
    await main();
    const printed = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0] ?? ''))
      .join('\n');
    // Scoped to its command: minimist parses flags globally, so unscoped help
    // text would advertise a flag that does nothing on the other commands.
    expect(printed).toMatch(/--force\s+update:/);
    expect(printed).toContain('.pharn-backup/');
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

  // -------------------------------------------------------------------------
  // FABLE 5.2 (first bullet) - a numeric-looking positional must stay a STRING.
  //
  // minimist coerces `123` to the NUMBER 123 unless `_` is declared a string, and
  // that number is handed straight to `parseCapabilityArg`, which calls
  // `.includes(':')` on it - a raw `TypeError` stack instead of the curated
  // "valid capabilities" listing. `@types/minimist` declares `_: string[]`, so
  // the type checker never saw it; only a runtime assertion can.
  // -------------------------------------------------------------------------

  it('keeps a numeric `add` positional a string (not the number 123)', async () => {
    setArgv('add', '123');
    await main();
    expect(runAdd).toHaveBeenCalledWith('123');
    // The equality above would also hold for a loosely-compared number, so
    // assert the TYPE of what the command actually received.
    expect(typeof runAdd.mock.calls[0]![0]).toBe('string');
  });

  it('keeps a numeric `remove` positional a string (not the number 7)', async () => {
    setArgv('remove', '7');
    await main();
    expect(runRemove).toHaveBeenCalledWith('7');
    expect(typeof runRemove.mock.calls[0]![0]).toBe('string');
  });

  // A bare `add` / `remove` must still reach the interactive picker: the picker
  // branch is `arg === undefined`, so `string: ['_']` must not turn an absent
  // positional into anything else.
  it('leaves a bare `add` / `remove` argument undefined (the picker branch)', async () => {
    setArgv('add');
    await main();
    expect(runAdd).toHaveBeenCalledWith(undefined);
    setArgv('remove');
    await main();
    expect(runRemove).toHaveBeenCalledWith(undefined);
  });

  // -------------------------------------------------------------------------
  // FABLE 4.5 - argv pharn does not understand is REFUSED, never dropped.
  //
  // Before this, an unknown COMMAND exited 1 but an unknown FLAG was parsed into
  // `argv` and silently ignored: `pharn status --sctrict` ran in the default
  // exit-0 mode, so a typo in a CI pipeline permanently disarmed the drift gate
  // while every run stayed green. Same shape as `assertNoUnknownKeys`
  // (src/lib/seam-config.ts) at the other untrusted boundary - collect the
  // offenders, then hard-fail naming them (P5 fail-closed).
  // -------------------------------------------------------------------------

  const noCommandRan = (): void => {
    expect(runInit).not.toHaveBeenCalled();
    expect(runAdd).not.toHaveBeenCalled();
    expect(runRemove).not.toHaveBeenCalled();
    expect(runUpdate).not.toHaveBeenCalled();
    expect(runList).not.toHaveBeenCalled();
    expect(runStatus).not.toHaveBeenCalled();
  };
  const stderrText = (): string =>
    errSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');
  const stdoutText = (): string =>
    logSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');

  it('exits(1) on a mistyped --strict, so a CI drift gate cannot be silently disarmed', async () => {
    setArgv('status', '--sctrict');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('--sctrict');
    // Errors go to stderr, never stdout: `pharn list --json --bogus` must stay
    // parseable for a JSON consumer.
    expect(stdoutText()).toBe('');
    noCommandRan();
  });

  it('exits(1) on a mistyped --force, rather than running un-forced', async () => {
    setArgv('update', '--froce', '--yes');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('--froce');
    expect(stdoutText()).toBe('');
    noCommandRan();
  });

  it('exits(1) on an unknown short flag', async () => {
    setArgv('status', '-x');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('-x');
    noCommandRan();
  });

  it('exits(1) on a mistyped --help instead of starting a real install', async () => {
    // The worst case of the old behavior: `help` is a declared boolean, so
    // `--hepl` parsed as `{ help: false, hepl: true }`, missed the help
    // short-circuit, and fell through to `argv._[0] ?? 'init'`.
    setArgv('--hepl');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('--hepl');
    noCommandRan();
  });

  it('prints the usage text on stderr when it refuses', async () => {
    setArgv('status', '--sctrict');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Usage:');
  });

  // The pair the gate's PLACEMENT decides: after the short-circuits these print
  // usage / the version and swallow the typo; before them they refuse. A genuine
  // --help does not license an unknown sibling.
  it('exits(1) on `--help --bogus` and prints no usage on stdout', async () => {
    setArgv('--help', '--bogus');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stdoutText()).not.toContain('Usage:');
    expect(stderrText()).toContain('--bogus');
    noCommandRan();
  });

  it('exits(1) on `--version --bogus` and prints no version on stdout', async () => {
    setArgv('--version', '--bogus');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stdoutText()).toBe('');
    expect(stderrText()).toContain('--bogus');
    noCommandRan();
  });

  it('exits(1) on an extra positional for `add` instead of dropping it', async () => {
    setArgv('add', 'a11y', 'extra');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('extra');
    expect(stdoutText()).toBe('');
    noCommandRan();
  });

  it('exits(1) on any positional after a no-argument command', async () => {
    setArgv('status', 'extra');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('extra');
    noCommandRan();
  });

  // An unknown COMMAND keeps its own, more useful message: the arity table has
  // no entry for it, so the arity gate must not pre-empt the dispatch default.
  it('still says "Unknown command" (not "unexpected argument") for `bogus x`', async () => {
    setArgv('bogus', 'x');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unknown command');
  });

  // `cmd` is untrusted argv, so the arity table must not resolve inherited
  // Object.prototype keys: an object lookup would hand back a FUNCTION for
  // `toString`, and only the accident that `n > fn` is `n > NaN` kept the
  // outcome right. A Map makes "absent from the table" mean exactly that.
  it('treats an Object.prototype key as an unknown command, not an arity entry', async () => {
    setArgv('toString', 'x', 'y');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unknown command');
    expect(stderrText()).not.toContain('Unexpected argument');
    noCommandRan();
  });

  // Untrusted argv is echoed as DATA (P2), the way seam-config.ts names an
  // unknown config key: a control character must not reach the terminal raw.
  it('escapes the offending argument rather than echoing raw bytes', async () => {
    const bell = String.fromCharCode(7);
    setArgv('status', `--a${bell}b`);
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    const printed = stderrText();
    expect(printed).toContain('\\u0007');
    expect(printed).not.toContain(bell);
  });

  it('exits(1) on an unknown command', async () => {
    setArgv('bogus');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(errSpy).toHaveBeenCalled();
    expect(runInit).not.toHaveBeenCalled();
  });
});
