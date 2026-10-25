import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessExit, stubProcessExit } from './helpers.js';

const runInit = vi.fn(
  async (_opts?: {
    ref?: string;
    archetypes?: string[];
    yes?: boolean;
    dryRun?: boolean;
    json?: boolean;
  }) => undefined,
);
const runAdd = vi.fn(async (_arg?: string) => undefined);
const runRemove = vi.fn(async (_arg?: string) => undefined);
const runUpdate = vi.fn(
  async (_opts?: {
    force?: boolean;
    yes?: boolean;
    ref?: string;
    dryRun?: boolean;
    json?: boolean;
  }) => undefined,
);
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
const runUninstall = vi.fn(async (_opts?: { yes?: boolean }) => undefined);
vi.mock('../src/commands/uninstall.js', () => ({ runUninstall }));

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
    expect(runInit).toHaveBeenCalledWith({
      ref: undefined,
      yes: false,
      dryRun: false,
      json: false,
    });
    expect(runAdd).not.toHaveBeenCalled();
    expect(runUpdate).not.toHaveBeenCalled();
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

  it('routes `remove <arg>` with the argument alone — no option object', async () => {
    setArgv('remove', 'a11y');
    await main();
    // The exact-arity check: `toHaveBeenCalledWith` already rejects an extra
    // argument, but this names the contract the dispatcher is being held to.
    expect(runRemove.mock.calls[0]).toHaveLength(1);
  });

  it('routes `uninstall` to runUninstall, without --yes by default', async () => {
    setArgv('uninstall');
    await main();
    expect(runUninstall).toHaveBeenCalledWith({ yes: false });
  });

  it('passes `uninstall --yes` and its `-y` alias through', async () => {
    setArgv('uninstall', '--yes');
    await main();
    setArgv('uninstall', '-y');
    await main();
    expect(runUninstall.mock.calls).toEqual([[{ yes: true }], [{ yes: true }]]);
  });

  it('lists `uninstall` in the usage text', async () => {
    setArgv('--help');
    await main();
    expect(String(logSpy.mock.calls[0]![0])).toMatch(/^\s+uninstall\s+/m);
    expect(String(logSpy.mock.calls[0]![0])).toContain(
      'update, uninstall: skip the confirmation prompt',
    );
  });

  it('routes the `rm` alias to runRemove', async () => {
    setArgv('rm', 'lens:n-plus-one');
    await main();
    expect(runRemove).toHaveBeenCalledWith('lens:n-plus-one');
  });

  it('routes `update` to runUpdate with force:false, yes:false by default', async () => {
    setArgv('update');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: false,
      yes: false,
      dryRun: false,
      json: false,
      compact: false,
    });
  });

  it('passes force:true through for `update --force`', async () => {
    setArgv('update', '--force');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: true,
      yes: false,
      dryRun: false,
      json: false,
      compact: false,
    });
  });

  // `--yes` was parsed but dead before this: minimist listed it and only
  // `runRemove` took it — in a parameter it never read. That parameter is gone
  // (`remove` has no `--yes`), so this is the flag's ONE real consumer.
  it('passes yes:true through for `update --yes`', async () => {
    setArgv('update', '--yes');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: false,
      yes: true,
      dryRun: false,
      json: false,
      compact: false,
    });
  });

  it('accepts the -y alias for `update`', async () => {
    setArgv('update', '-y');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: false,
      yes: true,
      dryRun: false,
      json: false,
      compact: false,
    });
  });

  it('passes dryRun:true through for `update --dry-run`', async () => {
    setArgv('update', '--dry-run');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: false,
      yes: false,
      dryRun: true,
      json: false,
      compact: false,
    });
  });

  it('composes `update --dry-run` with --force, --yes and --ref', async () => {
    setArgv('update', '--dry-run', '--force', '-y', '--ref', 'latest');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: true,
      yes: true,
      dryRun: true,
      json: false,
      compact: false,
      ref: 'latest',
    });
  });

  it('reads `--dry-run=false` and `--no-dry-run` as dryRun:false', async () => {
    setArgv('update', '--dry-run=false');
    await main();
    expect(runUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ dryRun: false }),
    );
    setArgv('update', '--no-dry-run');
    await main();
    expect(runUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ dryRun: false }),
    );
  });

  it.each(['add', 'remove', 'list', 'status'])(
    'refuses `--dry-run` on `%s`',
    async (cmd) => {
      setArgv(cmd, '--dry-run');
      await expect(main()).rejects.toThrow(ProcessExit);
      expect(runUpdate).not.toHaveBeenCalled();
      const out = errSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .join('\n');
      expect(out).toContain(`Unsupported option for \`${cmd}\``);
      expect(out).toContain('--dry-run');
    },
  );

  it('still refuses `--dry-run` beside a genuine --help on another command', async () => {
    setArgv('status', '--help', '--dry-run');
    await expect(main()).rejects.toThrow(ProcessExit);
  });

  it('documents --dry-run as an update flag in the usage text', async () => {
    setArgv('--help');
    await main();
    expect(String(logSpy.mock.calls[0]![0])).toMatch(
      /--dry-run\s+update: show what would change and write nothing/,
    );
  });

  it('composes `update --yes --force` (the full CI re-apply)', async () => {
    setArgv('update', '--yes', '--force');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: true,
      yes: true,
      dryRun: false,
      json: false,
      compact: false,
    });
  });

  it('documents --yes as an update and uninstall flag in the usage text', async () => {
    setArgv('--help');
    await main();
    const printed = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0] ?? ''))
      .join('\n');
    // Scoped to its commands, like --force: `init` deliberately has no --yes.
    expect(printed).toMatch(/-y, --yes\s+update, uninstall:/);
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
    expect(printed).toContain('pharn/.backup/');
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
    expect(runStatus).toHaveBeenCalledWith({
      strict: false,
      drift: true,
      json: false,
    });
  });

  it('passes strict:true through for `status --strict`', async () => {
    setArgv('status', '--strict');
    await main();
    expect(runStatus).toHaveBeenCalledWith({
      strict: true,
      drift: true,
      json: false,
    });
  });

  it('maps `status --no-drift` to drift:false', async () => {
    setArgv('status', '--no-drift');
    await main();
    expect(runStatus).toHaveBeenCalledWith({
      strict: false,
      drift: false,
      json: false,
    });
  });

  it('routes `status --json` to runStatus with json:true', async () => {
    setArgv('status', '--json');
    await main();
    expect(runStatus).toHaveBeenCalledWith({
      strict: false,
      drift: true,
      json: true,
    });
  });

  it('refuses an extra positional after `status --json`', async () => {
    setArgv('status', '--json', 'extra');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unexpected argument');
    noCommandRan();
  });

  it('composes `status --json --strict --no-drift`', async () => {
    setArgv('status', '--json', '--strict', '--no-drift');
    await main();
    expect(runStatus).toHaveBeenCalledWith({
      strict: true,
      drift: false,
      json: true,
    });
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
    expect(runUninstall).not.toHaveBeenCalled();
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

  // F-29: one error line and a pointer, never the ~2 KB usage text, which
  // scrolled the actual error off the terminal.
  it('prints one error line and a pointer at --help when it refuses', async () => {
    setArgv('status', '--sctrict');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(errSpy.mock.calls).toEqual([
      ['Unknown option: "--sctrict"'],
      ['Run `pharn --help` for usage.'],
    ]);
    expect(stderrText()).not.toContain('Usage:');
  });

  it('prints one line and the pointer for an unknown command', async () => {
    setArgv('bogus');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(errSpy.mock.calls).toEqual([
      ['Unknown command: bogus'],
      ['Run `pharn --help` for usage.'],
    ]);
    noCommandRan();
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

  // -------------------------------------------------------------------------
  // AUDIT P-13 - a flag that belongs to ANOTHER command is REFUSED, not dropped.
  //
  // minimist declared every flag globally, and the dispatch simply did not read
  // the ones it did not want, so `pharn status --json` parsed, was dropped, and
  // exited 0. Measured on main in a project with a real pharn.config.json:
  // `pharn list --strict` printed the human inventory and exited 0, and
  // `pharn status --json` rendered clack chrome on STDOUT - so
  // `pharn status --json | jq` fed a JSON consumer box-drawing characters and a
  // success code, which is a CI gate that can never go red.
  //
  // The refusal reuses the unknown-option machinery entirely (stderr, the --help
  // pointer, JSON.stringify escaping, exit 1) and differs only in its LABEL,
  // because `--json` is a flag pharn knows - "Unknown option" would send the
  // user hunting for a typo that is not there.
  // -------------------------------------------------------------------------

  const expectUnsupported = async (
    argv: string[],
    offender: string,
  ): Promise<void> => {
    setArgv(...argv);
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain(offender);
    expect(stderrText()).toContain('Unsupported option');
    expect(stdoutText()).toBe('');
    noCommandRan();
  };

  it('exits(1) on `status --force` — a misapplied flag, not a dropped one', async () => {
    await expectUnsupported(['status', '--force'], '--force');
    // The command is named, so the message says WHICH command refused, and the
    // --help pointer follows on stderr exactly as on the unknown-option path.
    expect(stderrText()).toContain('status');
    expect(stderrText()).toContain('Run `pharn --help` for usage.');
    expect(stderrText()).not.toContain('Usage:');
  });

  it('exits(1) on `list --strict` instead of exiting 0 un-stricted', async () => {
    await expectUnsupported(['list', '--strict'], '--strict');
  });

  it('exits(1) on `add --json`', async () => {
    await expectUnsupported(['add', '--json'], '--json');
  });

  // The one flip that contradicts a shipped contract. `--yes` was a declared
  // boolean only because it is `update`'s flag, and CLAUDE.md pinned the
  // resulting `pharn remove --yes` no-op as "a harmless parse ... turning it
  // into a refusal belongs to a per-command allowlist". This is that allowlist.
  it('exits(1) on `remove --yes` — it was silently dropped before', async () => {
    await expectUnsupported(['remove', 'a11y', '--yes'], '--yes');
  });

  it('exits(1) on the `-y` alias for `remove` too', async () => {
    await expectUnsupported(['remove', 'a11y', '-y'], '-y');
  });

  // `uninstall` takes `--yes` and nothing else: no `--force`, no `--json`,
  // no `--dry-run` (its confirm's PLAN note is the preview).
  it('exits(1) on `uninstall --force`', async () => {
    await expectUnsupported(['uninstall', '--force'], '--force');
  });

  it('exits(1) on `uninstall --dry-run`', async () => {
    await expectUnsupported(['uninstall', '--dry-run'], '--dry-run');
  });

  it('exits(1) on `uninstall --ref main`', async () => {
    await expectUnsupported(['uninstall', '--ref', 'main'], '--ref');
  });

  it('exits(1) on an extra positional to `uninstall`', async () => {
    setArgv('uninstall', 'everything');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unexpected argument');
    expect(stderrText()).toContain('everything');
    noCommandRan();
  });

  it('exits(1) on `init --force`', async () => {
    await expectUnsupported(['init', '--force'], '--force');
  });

  // A command that HAS flags still refuses one that is not its own: the table
  // is per-command membership, not "does pharn know this flag at all".
  // (`update` now takes `--json`, but only with `--dry-run`: see the
  // cross-flag table below.)

  // `--archetype` is init's override, so it is init's ALONE.
  it('exits(1) on `status --archetype`', async () => {
    await expectUnsupported(['status', '--archetype'], '--archetype');
  });

  // With no command word `cmd` defaults to `init`, so these used to run a FULL
  // INSTALL while ignoring the flag entirely - the sharpest case in the set.
  // `init` now takes `--json`, but only beside `--dry-run` (REQUIRED_WITH), so
  // a bare `--json` is refused as INCOMPLETE rather than unsupported — still
  // exit 1, still no install, still nothing on stdout.
  it('exits(1) on a bare `--json` rather than running a full install', async () => {
    setArgv('--json');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stdoutText()).toBe('');
    expect(stderrText()).toContain('Incomplete option for `init`');
    expect(stderrText()).toContain('--json (needs --dry-run)');
    noCommandRan();
  });

  it('exits(1) on a bare `--force` rather than running a full install', async () => {
    await expectUnsupported(['--force'], '--force');
  });

  // A genuine --help does not license a MISAPPLIED sibling either, which is the
  // same rule the unknown-option gate applies to `--help --bogus`. Both gates
  // sit above the short-circuits so the ruling is one ruling, not two.
  it('exits(1) on `status --help --force` and prints no usage on stdout', async () => {
    setArgv('status', '--help', '--force');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stdoutText()).not.toContain('Usage:');
    expect(stderrText()).toContain('--force');
    noCommandRan();
  });

  it("prints usage for `status --help --json`: --json is status's own flag", async () => {
    setArgv('status', '--help', '--json');
    await main();
    expect(stdoutText()).toContain('Usage:');
    noCommandRan();
  });

  it('exits(1) on `list --version --force` and prints no version', async () => {
    setArgv('list', '--version', '--force');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stdoutText()).toBe('');
    expect(stderrText()).toContain('--force');
    noCommandRan();
  });

  // ... but --help and --version are in EVERY command's row, so asking for them
  // is never itself the offense.
  it('still prints usage for `status --help` alone', async () => {
    setArgv('status', '--help');
    await main();
    expect(stdoutText()).toContain('Usage:');
    noCommandRan();
  });

  it('still prints usage for `bogus --help` (absent from the table)', async () => {
    setArgv('bogus', '--help');
    await main();
    expect(stdoutText()).toContain('Usage:');
    noCommandRan();
  });

  // F-34: `pharn <cmd> --help` is that command's page — its usage line and ONLY
  // the options its ALLOWED_FLAGS row grants — while a bare `pharn --help` keeps
  // the full text. The rows below are restated, not imported: a flag added to a
  // row without a help entry (or the reverse) fails here.
  describe('per-command help', () => {
    const ROWS: Record<string, readonly string[]> = {
      init: ['--archetype', '--ref', '--yes', '--dry-run', '--json'],
      add: [],
      remove: [],
      rm: [],
      update: ['--force', '--yes', '--ref', '--dry-run', '--json', '--compact'],
      list: ['--json'],
      status: ['--strict', '--no-drift', '--json'],
      uninstall: ['--yes'],
    };
    const EVERY_FLAG = [...new Set(Object.values(ROWS).flat())];
    const listsFlag = (text: string, flag: string): boolean =>
      new RegExp(`^ +(?:-[a-z], )?${flag}(?: |$)`, 'm').test(text);

    it.each(Object.entries(ROWS))(
      '`%s --help` lists exactly the options it takes',
      async (cmd, row) => {
        setArgv(cmd, '--help');
        await main();
        const page = stdoutText();
        expect(page).toContain('Usage:');
        expect(page).toContain(`pharn ${cmd === 'rm' ? 'remove' : cmd}`);
        expect(page).not.toContain('Commands:');
        for (const flag of EVERY_FLAG) {
          expect(listsFlag(page, flag), flag).toBe(row.includes(flag));
        }
        // --help and --version are in every row.
        expect(listsFlag(page, '--help')).toBe(true);
        expect(listsFlag(page, '--version')).toBe(true);
        expect(page).toContain('Run `pharn --help`');
        noCommandRan();
      },
    );

    it('describes an option on its command page without the command prefix', async () => {
      setArgv('status', '--help');
      await main();
      expect(stdoutText()).toMatch(/--strict +exit 1 on any outdated/);
      expect(stdoutText()).not.toMatch(/status: /);
    });

    it('shows only the use of a shared option that belongs to the command', async () => {
      setArgv('list', '--help');
      await main();
      expect(stdoutText()).toMatch(/--json +emit the inventory as JSON/);
      expect(stdoutText()).not.toContain('JSON report');
    });

    it('names the `rm` alias on the remove page', async () => {
      setArgv('rm', '--help');
      await main();
      expect(stdoutText()).toMatch(/^ +pharn rm \[capability\] +\(alias\)$/m);
    });

    it.each([[['--help']], [['--dry-run', '--help']], [['-h']]])(
      'keeps the full text for `pharn %j` (no command word)',
      async (argv) => {
        setArgv(...argv);
        await main();
        expect(stdoutText()).toContain('Commands:');
        expect(stdoutText()).toContain('Environment:');
      },
    );

    it('lists the `rm` alias and the environment variables in the full text', async () => {
      setArgv('--help');
      await main();
      const full = stdoutText();
      expect(full).toMatch(/^ {2}remove, rm \[capability\] +Remove/m);
      expect(full).toMatch(/^ {2}PHARN_DEBUG=1 +/m);
      expect(full).toMatch(/^ {2}NODE_USE_ENV_PROXY=1 +/m);
      expect(full).toMatch(/^ {2}NO_COLOR=1 +/m);
    });
  });

  // The two labels stay distinct: a TYPO is still "Unknown option", because
  // telling a user their real flag is unrecognised sends them hunting for a
  // misspelling that does not exist.
  it('still says "Unknown option" for a typo, not "Unsupported option"', async () => {
    setArgv('status', '--sctrict');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unknown option');
    expect(stderrText()).not.toContain('Unsupported option');
  });

  // An unknown COMMAND is not flag-checked at all - the table has no row for
  // it, exactly like the arity table - so the more useful message still wins.
  it('still says "Unknown command" for `bogus --json`, not a flag error', async () => {
    setArgv('bogus', '--json');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unknown command');
    expect(stderrText()).not.toContain('Unsupported option');
    noCommandRan();
  });

  // `cmd` is untrusted argv, so the FLAG table must not resolve inherited
  // Object.prototype keys either: an object lookup would hand back a FUNCTION
  // for `toString`, and `fn.includes(...)` inside the per-command parse would
  // throw a raw TypeError instead of reporting an unknown command.
  it('treats an Object.prototype key as an unknown command, not a flag row', async () => {
    setArgv('toString', '--json');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('Unknown command');
    expect(stderrText()).not.toContain('Unsupported option');
    noCommandRan();
  });

  // Precedence: the flag gate runs BEFORE the arity gate, matching the file's
  // existing order (a global unknown option already beats an extra positional).
  it('names the unsupported flag, not the extra positional, when both are wrong', async () => {
    setArgv('status', '--force', 'extra');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('--force');
    expect(stderrText()).not.toContain('Unexpected argument');
    noCommandRan();
  });

  // minimist reports a short BUNDLE once per unknown letter, naming the whole
  // token each time, so this used to print `"-xz", "-xz"`.
  it('names a bundled unknown flag once, not once per letter', async () => {
    setArgv('status', '-xz');
    await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    expect(stderrText()).toContain('"-xz"');
    expect(stderrText()).not.toContain('"-xz", "-xz"');
  });

  // -------------------------------------------------------------------------
  // The other half of the gate: a FALSE POSITIVE breaks a working command,
  // which would be strictly worse than the bug being fixed. The per-command
  // pass declares a SMALLER boolean set than the real parse, and boolean
  // declarations are what decide whether minimist swallows the next token - so
  // the shapes most likely to diverge are pinned here.
  // -------------------------------------------------------------------------

  it('still routes a positional containing a colon', async () => {
    setArgv('add', 'lens:n-plus-one');
    await main();
    expect(runAdd).toHaveBeenCalledWith('lens:n-plus-one');
  });

  it('still honours the `--` terminator', async () => {
    setArgv('add', '--', '--json');
    await main();
    expect(runAdd).toHaveBeenCalledWith('--json');
  });

  it('still routes the `rm` alias with an argument', async () => {
    setArgv('rm', 'a11y');
    await main();
    expect(runRemove).toHaveBeenCalledWith('a11y');
  });

  it('still composes `update --force --yes` in either order', async () => {
    setArgv('update', '--force', '--yes');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: true,
      yes: true,
      dryRun: false,
      json: false,
      compact: false,
    });
    setArgv('update', '--yes', '--force');
    await main();
    expect(runUpdate).toHaveBeenLastCalledWith({
      force: true,
      yes: true,
      dryRun: false,
      json: false,
      compact: false,
    });
  });

  it('still runs init on a bare `pharn` with no argv at all', async () => {
    setArgv();
    await main();
    expect(runInit).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // The table grants flags; the dispatch reads them. Nothing structural ties
  // the two together, so a mistyped row (`['list', ['strict']]`) would be
  // self-consistent and would silently re-open P-13 for that command with every
  // other gate green. These pin the agreement.
  // -------------------------------------------------------------------------

  it('threads exactly the flags each row grants, and no others', async () => {
    setArgv('update', '--force', '--yes');
    await main();
    expect(Object.keys(runUpdate.mock.calls[0]![0]!).sort()).toEqual([
      'compact',
      'dryRun',
      'force',
      'json',
      'ref',
      'yes',
    ]);

    setArgv('init');
    await main();
    expect(Object.keys(runInit.mock.calls[0]![0]!).sort()).toEqual([
      'archetypes',
      'dryRun',
      'json',
      'ref',
      'yes',
    ]);

    setArgv('list', '--json');
    await main();
    expect(Object.keys(runList.mock.calls[0]![0]!).sort()).toEqual(['json']);

    setArgv('status', '--strict');
    await main();
    expect(Object.keys(runStatus.mock.calls[0]![0]!).sort()).toEqual([
      'drift',
      'json',
      'strict',
    ]);
  });

  it('passes no option object at all to the two flagless commands', async () => {
    setArgv('add', 'a11y');
    await main();
    expect(runAdd.mock.calls[0]).toHaveLength(1);

    setArgv('remove', 'a11y');
    await main();
    expect(runRemove.mock.calls[0]).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // `--ref`: the one VALUE-taking option. Its name is checked like every other
  // flag (init and update only); its value against an exact allowlist.
  // -------------------------------------------------------------------------

  describe('--ref', () => {
    it.each([
      ['init', 'main'],
      ['init', 'latest'],
      ['update', 'main'],
      ['update', 'latest'],
    ])('`%s --ref %s` threads the value', async (cmd, value) => {
      setArgv(cmd, '--ref', value);
      await main();
      const fn = cmd === 'init' ? runInit : runUpdate;
      expect(fn.mock.calls[0]![0]).toMatchObject({ ref: value });
    });

    it('accepts the `--ref=main` form', async () => {
      setArgv('update', '--ref=main', '--yes');
      await main();
      expect(runUpdate).toHaveBeenCalledWith({
        force: false,
        yes: true,
        dryRun: false,
        json: false,
        compact: false,
        ref: 'main',
      });
    });

    it('binds its value, so the value is not read as a positional', async () => {
      // Without the string declaration, `main` would be a second positional
      // and the arity gate would refuse `init main`.
      setArgv('init', '--ref', 'main');
      await main();
      expect(runInit).toHaveBeenCalledTimes(1);
    });

    it('passes undefined when absent, so each command picks its own default', async () => {
      setArgv('update');
      await main();
      expect(runUpdate.mock.calls[0]![0]!.ref).toBeUndefined();
    });

    it.each([
      [['init', '--ref', 'tip']],
      [['init', '--ref', 'MAIN']],
      [['init', '--ref']],
      [['update', '--ref', '--yes']],
      [['update', '--no-ref']],
      [['init', '--ref=main', '--ref=latest']],
    ])('refuses an invalid value: %j', async (args) => {
      setArgv(...args);
      await expect(main()).rejects.toMatchObject(new ProcessExit(1));
      expect(runInit).not.toHaveBeenCalled();
      expect(runUpdate).not.toHaveBeenCalled();
      expect(stderrText()).toContain('Invalid value for --ref');
      expect(stderrText()).toContain('"main" or "latest"');
    });

    it('refuses an invalid value even beside --help', async () => {
      setArgv('init', '--help', '--ref', 'tip');
      await expect(main()).rejects.toMatchObject(new ProcessExit(1));
    });

    it.each(['status', 'add', 'remove', 'list'])(
      'is refused for `%s`, which follows the recorded channel',
      async (cmd) => {
        setArgv(cmd, '--ref', 'main');
        await expect(main()).rejects.toMatchObject(new ProcessExit(1));
        expect(stderrText()).toContain(`Unsupported option for \`${cmd}\``);
      },
    );
  });

  // -------------------------------------------------------------------------
  // `--archetype`: init's override of detection. A VALUE-taking option like
  // `--ref`, held to the same strictness: an exact comma-separated list of the
  // canonical archetypes, each at most once, `lib` only alone — anything else
  // refused before the --help/--version short-circuits.
  // -------------------------------------------------------------------------

  describe('--archetype', () => {
    it.each<[string, string[]]>([
      ['ssr', ['ssr']],
      ['backend', ['backend']],
      ['spa', ['spa']],
      ['lib', ['lib']],
      ['spa,backend', ['backend', 'spa']],
      ['spa,ssr,backend', ['ssr', 'backend', 'spa']],
    ])(
      '`init --archetype %s` threads %j (canonical order)',
      async (value, expected) => {
        setArgv('init', '--archetype', value);
        await main();
        expect(runInit).toHaveBeenCalledWith({
          ref: undefined,
          archetypes: expected,
          yes: false,
          dryRun: false,
          json: false,
        });
      },
    );

    it('accepts the `--archetype=…` form and composes with --ref', async () => {
      setArgv('init', '--archetype=backend', '--ref', 'latest');
      await main();
      expect(runInit).toHaveBeenCalledWith({
        ref: 'latest',
        archetypes: ['backend'],
        yes: false,
        dryRun: false,
        json: false,
      });
    });

    // The init row's other flags compose with it: the dry run (text and JSON)
    // and the prompt-free --yes all receive the override.
    it.each<[string[], Record<string, unknown>]>([
      [
        ['init', '--archetype', 'backend', '--dry-run'],
        { dryRun: true, json: false, yes: false },
      ],
      [
        ['init', '--archetype', 'backend', '--dry-run', '--json'],
        { dryRun: true, json: true, yes: false },
      ],
      [
        ['init', '--archetype', 'backend', '--yes'],
        { dryRun: false, json: false, yes: true },
      ],
      [
        ['init', '-y', '--archetype=backend'],
        { dryRun: false, json: false, yes: true },
      ],
      [
        ['--archetype', 'backend', '--dry-run', '--json'],
        { dryRun: true, json: true, yes: false },
      ],
    ])('composes with the init row: %j', async (args, flags) => {
      setArgv(...args);
      await main();
      expect(runInit).toHaveBeenCalledWith({
        ref: undefined,
        archetypes: ['backend'],
        ...flags,
      });
    });

    it('`--archetype x --json` without --dry-run is still Incomplete, not Invalid', async () => {
      setArgv('init', '--archetype', 'backend', '--json');
      await expect(main()).rejects.toMatchObject(new ProcessExit(1));
      expect(stderrText()).toContain('Incomplete option for `init`');
      expect(runInit).not.toHaveBeenCalled();
    });

    it('binds its value, so the value is not read as a positional', async () => {
      setArgv('init', '--archetype', 'backend');
      await main();
      expect(runInit).toHaveBeenCalledTimes(1);
    });

    it('still refuses an extra positional after its value', async () => {
      setArgv('init', '--archetype', 'backend', 'extra');
      await expect(main()).rejects.toMatchObject(new ProcessExit(1));
      expect(stderrText()).toContain('Unexpected argument: "extra"');
      expect(runInit).not.toHaveBeenCalled();
    });

    it('passes undefined when absent (detection decides)', async () => {
      setArgv('init');
      await main();
      expect(runInit.mock.calls[0]![0]!.archetypes).toBeUndefined();
    });

    it.each([
      [['init', '--archetype']],
      [['init', '--archetype=']],
      [['init', '--archetype', '--ref', 'main']],
      [['init', '--no-archetype']],
      [['init', '--archetype', 'ssr', '--archetype', 'spa']],
      [['init', '--archetype', 'bogus']],
      [['init', '--archetype', 'Backend']],
      [['init', '--archetype', 'backend,backend']],
      [['init', '--archetype', 'backend,']],
      [['init', '--archetype', ',backend']],
      [['init', '--archetype', 'backend, spa']],
      [['init', '--archetype', 'lib,backend']],
      [['init', '--archetype', 'universal']],
      [['--archetype', 'toString']],
    ])('refuses an invalid value: %j', async (args) => {
      setArgv(...args);
      await expect(main()).rejects.toMatchObject(new ProcessExit(1));
      expect(runInit).not.toHaveBeenCalled();
      expect(stderrText()).toContain('Invalid value for --archetype');
      expect(stderrText()).toContain('"ssr", "backend", "spa"');
    });

    it('names the offending value, escaped', async () => {
      setArgv('init', '--archetype', 'ssr\u001b[2J');
      await expect(main()).rejects.toMatchObject(new ProcessExit(1));
      expect(stderrText()).toContain('"ssr\\u001b[2J"');
    });

    it.each([['--help'], ['--version']])(
      'refuses an invalid value even beside %s',
      async (flag) => {
        setArgv('init', flag, '--archetype', 'bogus');
        await expect(main()).rejects.toMatchObject(new ProcessExit(1));
        expect(stderrText()).toContain('Invalid value for --archetype');
      },
    );

    it.each(['status', 'update', 'add', 'remove', 'list'])(
      'is refused for `%s`, which reads the recorded archetypes',
      async (cmd) => {
        setArgv(cmd, '--archetype', 'ssr');
        await expect(main()).rejects.toMatchObject(new ProcessExit(1));
        expect(stderrText()).toContain(`Unsupported option for \`${cmd}\``);
      },
    );
  });

  it('scopes every option to its command in the usage text', async () => {
    setArgv('--help');
    await main();
    const printed = stdoutText();
    expect(printed).toMatch(/--json\s+list:/);
    expect(printed).toMatch(/--strict\s+status:/);
    expect(printed).toMatch(/--json[^\n]*\n\s+status:/);
    expect(printed).toMatch(/--no-drift\s+status:/);
    expect(printed).toMatch(/--archetype <list>\s+init:/);
    expect(printed).not.toContain('no-op');
    expect(printed).toMatch(/--ref <ref>\s+init, update:/);
  });
});

// ---------------------------------------------------------------------------
// The cross-flag table (REQUIRED_WITH): a flag a command takes, but only
// together with another. `update --json` is the dry run's JSON form.
// ---------------------------------------------------------------------------
describe('main (cross-flag requirements)', () => {
  stubProcessExit();
  const realArgv = process.argv;
  let errSpy: ReturnType<typeof vi.spyOn>;
  const stderr = (): string =>
    errSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.argv = realArgv;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('passes json:true through for `update --dry-run --json`', async () => {
    setArgv('update', '--dry-run', '--json');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: false,
      yes: false,
      dryRun: true,
      json: true,
      compact: false,
    });
  });

  it('composes `--json` with --force and --ref', async () => {
    setArgv('update', '--json', '--dry-run', '--force', '--ref', 'latest');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: true,
      yes: false,
      dryRun: true,
      json: true,
      compact: false,
      ref: 'latest',
    });
  });

  it('passes compact:true through for `update --dry-run --json --compact`', async () => {
    setArgv('update', '--dry-run', '--json', '--compact');
    await main();
    expect(runUpdate).toHaveBeenCalledWith({
      force: false,
      yes: false,
      dryRun: true,
      json: true,
      compact: true,
    });
  });

  it.each([
    [['update', '--compact'], '--compact (needs --json)'],
    [['update', '--compact', '--dry-run'], '--compact (needs --json)'],
    [['update', '--json', '--compact'], '--json (needs --dry-run)'],
    [['update', '--compact', '--help'], '--compact (needs --json)'],
  ] as const)('refuses `%j` as an incomplete option', async (argv, needle) => {
    setArgv(...argv);
    await expect(main()).rejects.toThrow(new ProcessExit(1));
    expect(runUpdate).not.toHaveBeenCalled();
    const out = stderr();
    expect(out).toContain('Incomplete option for `update`');
    expect(out).toContain(needle);
  });

  it.each(['status', 'list', 'add', 'remove', 'rm', 'init'])(
    'refuses --compact as unsupported on `%s`',
    async (cmd) => {
      setArgv(cmd, '--compact');
      await expect(main()).rejects.toThrow(new ProcessExit(1));
      expect(stderr()).toContain(`Unsupported option for \`${cmd}\``);
      expect(stderr()).toContain('--compact');
    },
  );

  it('documents --compact in the usage text', async () => {
    setArgv('--help');
    await main();
    expect(String(vi.mocked(console.log).mock.calls[0]![0])).toMatch(
      /--compact\s+update: with --dry-run --json/,
    );
  });

  it('refuses `update --json` alone: exit 1, stderr, pointer, runUpdate never called', async () => {
    setArgv('update', '--json');
    await expect(main()).rejects.toThrow(new ProcessExit(1));
    expect(runUpdate).not.toHaveBeenCalled();
    const out = stderr();
    expect(out).toContain('Incomplete option for `update`');
    expect(out).toContain('--json (needs --dry-run)');
    expect(out).toContain('Run `pharn --help` for usage.');
    expect(out).not.toContain('Usage:');
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each([
    ['update', '--json', '--help'],
    ['update', '--help', '--json'],
    ['update', '--json', '--version'],
    ['update', '--json', '--force'],
    ['update', '--json', '--yes'],
    ['update', '--dry-run=false', '--json'],
    ['update', '--no-dry-run', '--json'],
  ])(
    'refuses `%s %s %s`: a genuine --help licenses no misapplied sibling',
    async (...argv) => {
      setArgv(...argv);
      await expect(main()).rejects.toThrow(new ProcessExit(1));
      expect(runUpdate).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(stderr()).toContain('--json (needs --dry-run)');
    },
  );

  it('reads `--json=false` as absent, like the dispatch does', async () => {
    setArgv('update', '--json=false');
    await main();
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false, json: false }),
    );
  });

  it('does not touch the commands outside its table', async () => {
    setArgv('status', '--json');
    await main();
    expect(runStatus).toHaveBeenCalledTimes(1);
    setArgv('list', '--json');
    await main();
    expect(runList).toHaveBeenCalledWith({ json: true });
  });

  it('keeps "Unknown command" for a bogus command with --json', async () => {
    setArgv('bogus', '--json');
    await expect(main()).rejects.toThrow(new ProcessExit(1));
    expect(stderr()).toContain('Unknown command: bogus');
  });

  it('documents --json as an update flag in the usage text', async () => {
    setArgv('--help');
    await main();
    const printed = vi
      .mocked(console.log)
      .mock.calls.map((c: unknown[]) => String(c[0] ?? ''))
      .join('\n');
    expect(printed).toMatch(
      /update: with --dry-run, emit the plan as one JSON object/,
    );
  });
});

// ---------------------------------------------------------------------------
// `init`'s preview and non-interactive flags: --dry-run, --dry-run --json, and
// --yes / -y. `--json` needs `--dry-run` here too (REQUIRED_WITH's init row).
// ---------------------------------------------------------------------------
describe('main (init --dry-run / --json / --yes)', () => {
  stubProcessExit();
  const realArgv = process.argv;
  let errSpy: ReturnType<typeof vi.spyOn>;
  const stderr = (): string =>
    errSpy.mock.calls.map((c: unknown[]) => String(c[0] ?? '')).join('\n');

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.argv = realArgv;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each([
    [['init', '--dry-run'], { dryRun: true, json: false, yes: false }],
    [['init', '--dry-run', '--json'], { dryRun: true, json: true, yes: false }],
    [['init', '--yes'], { dryRun: false, json: false, yes: true }],
    [['init', '-y'], { dryRun: false, json: false, yes: true }],
    [['init', '--yes', '--dry-run'], { dryRun: true, json: false, yes: true }],
    [['--dry-run'], { dryRun: true, json: false, yes: false }],
  ] as const)('threads `%j` to runInit', async (argv, expected) => {
    setArgv(...argv);
    await main();
    expect(runInit).toHaveBeenCalledWith({ ref: undefined, ...expected });
  });

  it.each([
    ['init', '--json'],
    ['init', '--json', '--help'],
    ['init', '--json', '--yes'],
    ['init', '--dry-run=false', '--json'],
  ])('refuses `%s %s %s` as an incomplete option', async (...argv) => {
    setArgv(...argv.filter(Boolean));
    await expect(main()).rejects.toThrow(new ProcessExit(1));
    expect(runInit).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(stderr()).toContain('Incomplete option for `init`');
    expect(stderr()).toContain('--json (needs --dry-run)');
  });

  it('documents the init flags in the usage text', async () => {
    setArgv('--help');
    await main();
    const printed = String(vi.mocked(console.log).mock.calls[0]![0]);
    expect(printed).toMatch(/--yes[^\n]*\n(?:[^\n]*\n)*?\s+init: /);
    expect(printed).toMatch(/--dry-run[^\n]*\n(?:[^\n]*\n)*?\s+init: /);
    expect(printed).toMatch(
      /init: with --dry-run, emit the plan as one JSON object/,
    );
  });
});
