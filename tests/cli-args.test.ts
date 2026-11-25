import { describe, expect, it } from 'vitest';
import {
  parseCliArgs,
  USAGE_POINTER,
  type InitArgs,
  type Invocation,
} from '../src/lib/cli-args.js';
import { PHARN_VERSION } from '../src/version.js';

// The pure argv parser, table by table. Each helper fails the test with the
// whole result when the parse took a different branch.
function invocation(args: readonly string[]): Invocation {
  const r = parseCliArgs(args);
  if (r.kind !== 'run') throw new Error(`expected a run: ${JSON.stringify(r)}`);
  return r.invocation;
}
function refusal(args: readonly string[]): string {
  const r = parseCliArgs(args);
  if (r.kind !== 'refuse') {
    throw new Error(`expected a refusal: ${JSON.stringify(r)}`);
  }
  return r.message;
}
function printed(args: readonly string[]): string {
  const r = parseCliArgs(args);
  if (r.kind !== 'print')
    throw new Error(`expected print: ${JSON.stringify(r)}`);
  return r.text;
}

const INIT: InitArgs = {
  ref: undefined,
  archetypes: undefined,
  yes: false,
  dryRun: false,
  json: false,
};
const UPDATE = {
  force: false,
  yes: false,
  dryRun: false,
  json: false,
  compact: false,
  ref: undefined,
};
const STATUS = { strict: false, drift: true, json: false };

describe('parseCliArgs: what each command receives', () => {
  it.each<[string[], Invocation]>([
    // `init` is the default command.
    [[], { command: 'init', options: INIT }],
    [['init'], { command: 'init', options: INIT }],
    [
      ['init', '--dry-run'],
      { command: 'init', options: { ...INIT, dryRun: true } },
    ],
    [['--dry-run'], { command: 'init', options: { ...INIT, dryRun: true } }],
    [['init', '--yes'], { command: 'init', options: { ...INIT, yes: true } }],
    [['init', '-y'], { command: 'init', options: { ...INIT, yes: true } }],
    [
      ['init', '--yes', '--dry-run'],
      { command: 'init', options: { ...INIT, yes: true, dryRun: true } },
    ],
    [
      ['init', '--dry-run', '--json'],
      { command: 'init', options: { ...INIT, dryRun: true, json: true } },
    ],
    // The positional is always a string, a colon or digits included.
    [
      ['add', 'lens:n-plus-one'],
      { command: 'add', capability: 'lens:n-plus-one' },
    ],
    [['add', '123'], { command: 'add', capability: '123' }],
    // No argument: the interactive picker.
    [['add'], { command: 'add', capability: undefined }],
    [['remove'], { command: 'remove', capability: undefined }],
    [['remove', '7'], { command: 'remove', capability: '7' }],
    [['remove', 'a11y'], { command: 'remove', capability: 'a11y' }],
    [
      ['rm', 'lens:n-plus-one'],
      { command: 'remove', capability: 'lens:n-plus-one' },
    ],
    // `--` ends the options.
    [['add', '--', '--json'], { command: 'add', capability: '--json' }],
    [['update'], { command: 'update', options: UPDATE }],
    [
      ['update', '--force'],
      { command: 'update', options: { ...UPDATE, force: true } },
    ],
    [
      ['update', '--yes'],
      { command: 'update', options: { ...UPDATE, yes: true } },
    ],
    [
      ['update', '-y'],
      { command: 'update', options: { ...UPDATE, yes: true } },
    ],
    // Options may come before the command word.
    [
      ['-y', 'update'],
      { command: 'update', options: { ...UPDATE, yes: true } },
    ],
    // A repeated on/off option cannot disagree with itself, so it is accepted.
    [
      ['update', '--yes', '-y'],
      { command: 'update', options: { ...UPDATE, yes: true } },
    ],
    [
      ['update', '--dry-run'],
      { command: 'update', options: { ...UPDATE, dryRun: true } },
    ],
    [
      ['update', '--yes', '--force'],
      { command: 'update', options: { ...UPDATE, yes: true, force: true } },
    ],
    [
      ['update', '--force', '--yes'],
      { command: 'update', options: { ...UPDATE, yes: true, force: true } },
    ],
    [
      ['update', '--dry-run', '--force', '-y', '--ref', 'latest'],
      {
        command: 'update',
        options: {
          ...UPDATE,
          dryRun: true,
          force: true,
          yes: true,
          ref: 'latest',
        },
      },
    ],
    [['list'], { command: 'list', options: { json: false } }],
    [['list', '--json'], { command: 'list', options: { json: true } }],
    [['status'], { command: 'status', options: STATUS }],
    [
      ['status', '--strict'],
      { command: 'status', options: { ...STATUS, strict: true } },
    ],
    [
      ['status', '--no-drift'],
      { command: 'status', options: { ...STATUS, drift: false } },
    ],
    [
      ['status', '--json'],
      { command: 'status', options: { ...STATUS, json: true } },
    ],
    [
      ['status', '--json', '--strict', '--no-drift'],
      {
        command: 'status',
        options: { strict: true, drift: false, json: true },
      },
    ],
    [['uninstall'], { command: 'uninstall', options: { yes: false } }],
    [['uninstall', '--yes'], { command: 'uninstall', options: { yes: true } }],
    [['uninstall', '-y'], { command: 'uninstall', options: { yes: true } }],
  ])('%j', (args, expected) => {
    expect(invocation(args)).toStrictEqual(expected);
  });
});

describe('parseCliArgs: --json implies --dry-run, --compact implies --json', () => {
  it.each<[string[], Invocation]>([
    [
      ['update', '--json'],
      { command: 'update', options: { ...UPDATE, dryRun: true, json: true } },
    ],
    [
      ['update', '--dry-run', '--json'],
      { command: 'update', options: { ...UPDATE, dryRun: true, json: true } },
    ],
    [
      ['update', '--compact'],
      {
        command: 'update',
        options: { ...UPDATE, dryRun: true, json: true, compact: true },
      },
    ],
    [
      ['update', '--compact', '--dry-run'],
      {
        command: 'update',
        options: { ...UPDATE, dryRun: true, json: true, compact: true },
      },
    ],
    [
      ['update', '--json', '--compact'],
      {
        command: 'update',
        options: { ...UPDATE, dryRun: true, json: true, compact: true },
      },
    ],
    [
      ['update', '--dry-run', '--json', '--compact'],
      {
        command: 'update',
        options: { ...UPDATE, dryRun: true, json: true, compact: true },
      },
    ],
    [
      ['update', '--json', '--force', '--ref', 'latest'],
      {
        command: 'update',
        options: {
          ...UPDATE,
          dryRun: true,
          json: true,
          force: true,
          ref: 'latest',
        },
      },
    ],
    [
      ['update', '--json', '--yes'],
      {
        command: 'update',
        options: { ...UPDATE, dryRun: true, json: true, yes: true },
      },
    ],
    [
      ['init', '--json'],
      { command: 'init', options: { ...INIT, dryRun: true, json: true } },
    ],
    // A bare `pharn --json` is `init --dry-run --json`.
    [
      ['--json'],
      { command: 'init', options: { ...INIT, dryRun: true, json: true } },
    ],
    [
      ['init', '--json', '--yes'],
      {
        command: 'init',
        options: { ...INIT, dryRun: true, json: true, yes: true },
      },
    ],
  ])('%j', (args, expected) => {
    expect(invocation(args)).toStrictEqual(expected);
  });
});

describe('parseCliArgs: --ref', () => {
  it.each([
    ['init', 'main'],
    ['init', 'latest'],
    ['update', 'main'],
    ['update', 'latest'],
  ])('`%s --ref %s` threads the value', (cmd, value) => {
    expect(invocation([cmd, '--ref', value])).toMatchObject({
      options: { ref: value },
    });
  });

  it('accepts the `--ref=main` form and binds the value (not a positional)', () => {
    expect(invocation(['update', '--ref=main', '--yes'])).toStrictEqual({
      command: 'update',
      options: { ...UPDATE, yes: true, ref: 'main' },
    });
    expect(invocation(['init', '--ref', 'main'])).toStrictEqual({
      command: 'init',
      options: { ...INIT, ref: 'main' },
    });
  });

  const INVALID_REF = 'Invalid value for --ref (expected "main" or "latest"): ';
  it.each<[string[], string]>([
    [['init', '--ref', 'tip'], '"tip"'],
    [['init', '--ref', 'MAIN'], '"MAIN"'],
    // A bare --ref names the empty value.
    [['init', '--ref'], '""'],
    [['init', '--ref='], '""'],
    // The next argument is taken as the value, and it is not a choice.
    [['update', '--ref', '--yes'], '"--yes"'],
    // Before the --help short-circuit.
    [['init', '--help', '--ref', 'tip'], '"tip"'],
  ])('refuses %j', (args, offender) => {
    expect(refusal(args)).toBe(INVALID_REF + offender);
  });
});

describe('parseCliArgs: --archetype', () => {
  it.each<[string, string[]]>([
    ['ssr', ['ssr']],
    ['backend', ['backend']],
    ['spa', ['spa']],
    ['lib', ['lib']],
    ['spa,backend', ['backend', 'spa']],
    ['spa,ssr,backend', ['ssr', 'backend', 'spa']],
  ])(
    '`init --archetype %s` threads %j (canonical order)',
    (value, expected) => {
      expect(invocation(['init', '--archetype', value])).toStrictEqual({
        command: 'init',
        options: { ...INIT, archetypes: expected },
      });
    },
  );

  it.each<[string[], Partial<InitArgs>]>([
    [['init', '--archetype=backend', '--ref', 'latest'], { ref: 'latest' }],
    [['init', '--archetype', 'backend', '--dry-run'], { dryRun: true }],
    [
      ['init', '--archetype', 'backend', '--dry-run', '--json'],
      { dryRun: true, json: true },
    ],
    [
      ['init', '--archetype', 'backend', '--json'],
      { dryRun: true, json: true },
    ],
    [['init', '--archetype', 'backend', '--yes'], { yes: true }],
    [['init', '-y', '--archetype=backend'], { yes: true }],
    [
      ['--archetype', 'backend', '--dry-run', '--json'],
      { dryRun: true, json: true },
    ],
  ])('composes with the init options: %j', (args, flags) => {
    expect(invocation(args)).toStrictEqual({
      command: 'init',
      options: { ...INIT, archetypes: ['backend'], ...flags },
    });
  });

  it.each([
    [['init', '--archetype']],
    [['init', '--archetype=']],
    // `--ref` is taken as the value; `main` never reaches the arity check.
    [['init', '--archetype', '--ref', 'main']],
    [['init', '--archetype', 'bogus']],
    [['init', '--archetype', 'Backend']],
    [['init', '--archetype', 'backend,backend']],
    [['init', '--archetype', 'backend,']],
    [['init', '--archetype', ',backend']],
    [['init', '--archetype', 'backend, spa']],
    [['init', '--archetype', 'lib,backend']],
    [['init', '--archetype', 'lib,ssr']],
    [['init', '--archetype', 'universal']],
    [['--archetype', 'toString']],
    [['init', '--help', '--archetype', 'bogus']],
    [['init', '--version', '--archetype', 'bogus']],
  ])('refuses an invalid value: %j', (args) => {
    expect(refusal(args)).toMatch(
      /^Invalid value for --archetype \(expected a comma-separated list of "ssr", "backend", "spa" — or "lib" alone — each at most once\): /,
    );
  });

  it('names the offending value, escaped', () => {
    expect(refusal(['init', '--archetype', 'ssr\u001b[2J'])).toContain(
      '"ssr\\u001b[2J"',
    );
  });
});

describe('parseCliArgs: refusals', () => {
  it.each<[string[], string]>([
    // A typo is unknown everywhere, before the command is known.
    [['status', '--sctrict'], 'Unknown option: "--sctrict"'],
    [['update', '--froce', '--yes'], 'Unknown option: "--froce"'],
    [['status', '-x'], 'Unknown option: "-x"'],
    [['--hepl'], 'Unknown option: "--hepl"'],
    // A genuine --help / --version licenses no bad sibling.
    [['--help', '--bogus'], 'Unknown option: "--bogus"'],
    [['--version', '--bogus'], 'Unknown option: "--bogus"'],
    // A bundle is named once, as written.
    [['status', '-xz'], 'Unknown option: "-xz"'],
    // Unknown beats unsupported.
    [['status', '--force', '--bogus'], 'Unknown option: "--bogus"'],
    // Only `--no-drift` is a declared negation.
    [['update', '--no-dry-run'], 'Unknown option: "--no-dry-run"'],
    [['update', '--no-yes'], 'Unknown option: "--no-yes"'],
    [['status', '--drift'], 'Unknown option: "--drift"'],
    [['init', '--no-archetype'], 'Unknown option: "--no-archetype"'],
    [['update', '--no-ref'], 'Unknown option: "--no-ref"'],
    [['init', '--no-ref'], 'Unknown option: "--no-ref"'],

    // An option another command takes is refused for this one.
    [['status', '--force'], 'Unsupported option for `status`: "--force"'],
    [['list', '--strict'], 'Unsupported option for `list`: "--strict"'],
    [['add', '--json'], 'Unsupported option for `add`: "--json"'],
    [['remove', 'a11y', '--yes'], 'Unsupported option for `remove`: "--yes"'],
    [['remove', 'a11y', '-y'], 'Unsupported option for `remove`: "-y"'],
    [['remove', 'a11y', '-yh'], 'Unsupported option for `remove`: "-yh"'],
    [['uninstall', '--force'], 'Unsupported option for `uninstall`: "--force"'],
    [
      ['uninstall', '--dry-run'],
      'Unsupported option for `uninstall`: "--dry-run"',
    ],
    [
      ['uninstall', '--ref', 'main'],
      'Unsupported option for `uninstall`: "--ref"',
    ],
    [['init', '--force'], 'Unsupported option for `init`: "--force"'],
    [['--force'], 'Unsupported option for `init`: "--force"'],
    [
      ['status', '--archetype'],
      'Unsupported option for `status`: "--archetype"',
    ],
    [
      ['status', '--help', '--force'],
      'Unsupported option for `status`: "--force"',
    ],
    [
      ['status', '--help', '--dry-run'],
      'Unsupported option for `status`: "--dry-run"',
    ],
    [
      ['list', '--version', '--force'],
      'Unsupported option for `list`: "--force"',
    ],
    // The option is named, not the extra positional.
    [
      ['status', '--force', 'extra'],
      'Unsupported option for `status`: "--force"',
    ],

    // An on/off option takes no value.
    [['update', '--dry-run=false'], 'Option takes no value: "--dry-run=false"'],
    [['update', '--json=false'], 'Option takes no value: "--json=false"'],
    [['list', '--json=false'], 'Option takes no value: "--json=false"'],
    [
      ['init', '--dry-run=false', '--json'],
      'Option takes no value: "--dry-run=false"',
    ],
    [['status', '--no-drift=1'], 'Option takes no value: "--no-drift=1"'],

    // parseArgs keeps the last of a repeated value; pharn refuses the pair.
    [['init', '--ref=main', '--ref=latest'], 'Repeated option: "--ref"'],
    [['init', '--ref', 'main', '--ref', 'main'], 'Repeated option: "--ref"'],
    [
      ['init', '--archetype', 'ssr', '--archetype', 'spa'],
      'Repeated option: "--archetype"',
    ],

    // An unknown command keeps its own message, flags and arity aside.
    [['bogus'], 'Unknown command: bogus'],
    [['bogus', 'x'], 'Unknown command: bogus'],
    [['bogus', '--json'], 'Unknown command: bogus'],
    // A prototype key is not a table entry.
    [['toString', 'x', 'y'], 'Unknown command: toString'],
    [['toString', '--json'], 'Unknown command: toString'],
    [['bo\u0007gus'], 'Unknown command: bo\\u0007gus'],

    // Extra positionals are refused, not dropped.
    [['add', 'a11y', 'extra'], 'Unexpected argument: "extra"'],
    [['add', 'a', 'b'], 'Unexpected argument: "b"'],
    [['status', 'extra'], 'Unexpected argument: "extra"'],
    [['status', '--json', 'extra'], 'Unexpected argument: "extra"'],
    [['uninstall', 'everything'], 'Unexpected argument: "everything"'],
    [
      ['init', '--archetype', 'backend', 'extra'],
      'Unexpected argument: "extra"',
    ],
  ])('%j', (args, message) => {
    expect(refusal(args)).toBe(message);
  });

  it.each(['add', 'remove', 'list', 'status'])(
    'refuses `--dry-run` on `%s`',
    (cmd) => {
      expect(refusal([cmd, '--dry-run'])).toBe(
        `Unsupported option for \`${cmd}\`: "--dry-run"`,
      );
    },
  );

  it.each(['status', 'add', 'remove', 'list'])(
    'refuses `--ref` on `%s`',
    (cmd) => {
      expect(refusal([cmd, '--ref', 'main'])).toBe(
        `Unsupported option for \`${cmd}\`: "--ref"`,
      );
    },
  );

  it.each(['status', 'update', 'add', 'remove', 'list'])(
    'refuses `--archetype` on `%s`',
    (cmd) => {
      expect(refusal([cmd, '--archetype', 'ssr'])).toBe(
        `Unsupported option for \`${cmd}\`: "--archetype"`,
      );
    },
  );

  it.each(['status', 'list', 'add', 'remove', 'rm', 'init'])(
    'refuses `--compact` on `%s`',
    (cmd) => {
      expect(refusal([cmd, '--compact'])).toBe(
        `Unsupported option for \`${cmd}\`: "--compact"`,
      );
    },
  );

  it('escapes an offending option rather than echoing raw bytes', () => {
    const bell = String.fromCharCode(7);
    const message = refusal(['status', `--a${bell}b`]);
    expect(message).toContain('\\u0007');
    expect(message).not.toContain(bell);
  });

  it('points every refusal at --help, not at the usage text', () => {
    expect(USAGE_POINTER).toBe('Run `pharn --help` for usage.');
  });
});

describe('parseCliArgs: --version and --help', () => {
  it.each([[['--version']], [['-v']], [['bogus', '--version']]])(
    '%j prints the version',
    (args) => {
      expect(printed(args)).toBe(PHARN_VERSION);
    },
  );

  it.each([
    [['--help']],
    [['-h']],
    [['--dry-run', '--help']],
    [['bogus', '--help']],
  ])('%j prints the full text (no command page)', (args) => {
    const text = printed(args);
    expect(text).toContain('Usage:');
    expect(text).toContain('Commands:');
    expect(text).toContain('Environment:');
    expect(text).toMatch(/capabilit/i);
    expect(text).not.toMatch(/methodology module|stack pack/i);
  });

  it('lists every command, the `rm` alias and the environment variables in the full text', () => {
    const full = printed(['--help']);
    for (const cmd of [
      'init',
      'add',
      'update',
      'list',
      'status',
      'uninstall',
    ]) {
      expect(full).toMatch(new RegExp(`^ {2}${cmd}\\b`, 'm'));
    }
    expect(full).toMatch(/^ {2}remove, rm \[capability\] +Remove/m);
    expect(full).toMatch(/^ {2}PHARN_DEBUG=1 +/m);
    expect(full).toMatch(/^ {2}NODE_USE_ENV_PROXY=1 +/m);
    expect(full).toMatch(/^ {2}NO_COLOR=1 +/m);
  });

  it('scopes every option to its commands in the full text', () => {
    const full = printed(['--help']);
    expect(full).toContain(
      'Options (each names the commands that take it; any other command refuses it):',
    );
    expect(full).not.toContain('ONE command');
    expect(full).toMatch(/--archetype <list>\s+init:/);
    expect(full).toMatch(/--ref <ref>\s+init: install from "latest"/);
    expect(full).toMatch(/\n\s+update: switch to "latest"/);
    expect(full).toMatch(/--force\s+update:/);
    expect(full).toContain('pharn/.backup/');
    expect(full).toMatch(
      /-y, --yes\s+update, uninstall: skip the confirmation prompt/,
    );
    expect(full).toMatch(
      /--yes[^\n]*\n(?:[^\n]*\n)*?\s+init: install without prompts/,
    );
    expect(full).toMatch(
      /--dry-run\s+update: show what would change and write nothing/,
    );
    expect(full).toMatch(
      /--dry-run[^\n]*\n(?:[^\n]*\n)*?\s+init: show what would be installed/,
    );
    expect(full).toMatch(/--strict\s+status:/);
    expect(full).toMatch(/--no-drift\s+status:/);
    expect(full).toMatch(/--json\s+list:/);
    expect(full).toMatch(/--json[^\n]*\n\s+status:/);
    expect(full).not.toContain('no-op');
  });

  it('says --json implies --dry-run and --compact implies --json', () => {
    const full = printed(['--help']);
    expect(full).toContain(
      'update: emit the plan as one JSON object (implies --dry-run)',
    );
    expect(full).toContain(
      'init: emit the plan as one JSON object (implies --dry-run)',
    );
    expect(full).toMatch(
      /--compact\s+update: omit the unchanged files from the JSON plan \(implies --json\)/,
    );
    expect(full).not.toContain('with --dry-run, emit');
    expect(full).not.toContain('with --dry-run --json');
  });

  // Restated, not imported: an option added to a command without a help
  // entry (or the reverse) fails here.
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
  const EVERY_OPTION = [...new Set(Object.values(ROWS).flat())];
  const listsOption = (text: string, option: string): boolean =>
    new RegExp(`^ +(?:-[a-z], )?${option}(?: |$)`, 'm').test(text);

  it.each(Object.entries(ROWS))(
    '`%s --help` lists exactly the options it takes',
    (cmd, row) => {
      const page = printed([cmd, '--help']);
      expect(page).toContain('Usage:');
      expect(page).toContain(`pharn ${cmd === 'rm' ? 'remove' : cmd}`);
      expect(page).not.toContain('Commands:');
      for (const option of EVERY_OPTION) {
        expect(listsOption(page, option), option).toBe(row.includes(option));
      }
      expect(listsOption(page, '--help')).toBe(true);
      expect(listsOption(page, '--version')).toBe(true);
      expect(page).toContain('Run `pharn --help`');
    },
  );

  it('describes an option on its command page without the command prefix', () => {
    const page = printed(['status', '--help']);
    expect(page).toMatch(/--strict +exit 1 on an outdated install/);
    expect(page).not.toMatch(/status: /);
  });

  it('names every condition `strictFails` checks on the `--strict` line', () => {
    // strictFails (lib/status-report.ts): outdated, modified/missing/unreadable
    // files, a surface upstream no longer ships, an unwired hook.
    const help = printed(['status', '--help']).replace(/\s+/g, ' ');
    for (const condition of [
      'outdated',
      'modified',
      'missing',
      'unreadable',
      'upstream no longer ships',
      'unwired hook',
      'under --no-drift, only outdated',
    ]) {
      expect(help, condition).toContain(condition);
    }
  });

  it('shows only the use of a shared option that belongs to the command', () => {
    const page = printed(['list', '--help']);
    expect(page).toMatch(/--json +emit the inventory as JSON/);
    expect(page).not.toContain('JSON report');
    expect(printed(['update', '--help'])).toMatch(
      /--json +emit the plan as one JSON object \(implies --dry-run\)/,
    );
  });

  it('names the `rm` alias on the remove page', () => {
    expect(printed(['rm', '--help'])).toMatch(
      /^ +pharn rm \[capability\] +\(alias\)$/m,
    );
  });

  it.each([
    [['status', '--help', '--json']],
    [['update', '--help', '--json']],
    [['update', '--compact', '--help']],
    [['init', '--json', '--help']],
  ])(
    '%j prints the command page: the sibling is that command’s own option',
    (args) => {
      expect(printed(args)).toContain(`pharn ${args[0]!} [options]`);
    },
  );
});

describe('parseCliArgs: verify-archive', () => {
  it.each<[string[], Invocation]>([
    [
      ['verify-archive', 'x.tar.gz'],
      {
        command: 'verify-archive',
        options: { file: 'x.tar.gz', expectVersion: undefined },
      },
    ],
    [
      ['verify-archive', 'x.tar.gz', '--expect-version', '7.25.5'],
      {
        command: 'verify-archive',
        options: { file: 'x.tar.gz', expectVersion: '7.25.5' },
      },
    ],
    [
      ['verify-archive', '--expect-version=7.25.5', 'x.tar.gz'],
      {
        command: 'verify-archive',
        options: { file: 'x.tar.gz', expectVersion: '7.25.5' },
      },
    ],
  ])('%j parses to its file and expected version', (args, expected) => {
    expect(invocation(args)).toEqual(expected);
  });

  const MISSING =
    'Missing argument: `verify-archive` needs the path of a .tar.gz archive';
  const INVALID =
    'Invalid value for --expect-version (expected a version such as "7.25.5", with no leading "v")';
  it.each<[string[], string]>([
    [['verify-archive'], MISSING],
    [['verify-archive', ''], MISSING],
    [
      ['verify-archive', 'a.tar.gz', 'b.tar.gz'],
      'Unexpected argument: "b.tar.gz"',
    ],
    [
      ['verify-archive', 'a.tar.gz', '--expect-version', 'v7.25.5'],
      `${INVALID}: "v7.25.5"`,
    ],
    [['verify-archive', 'a.tar.gz', '--expect-version'], `${INVALID}: ""`],
    [
      [
        'verify-archive',
        'a.tar.gz',
        '--expect-version',
        '1.0.0',
        '--expect-version',
        '1.0.1',
      ],
      'Repeated option: "--expect-version"',
    ],
    [
      ['verify-archive', 'a.tar.gz', '--json'],
      'Unsupported option for `verify-archive`: "--json"',
    ],
    [
      ['status', '--expect-version', '1.0.0'],
      'Unsupported option for `status`: "--expect-version"',
    ],
    [
      ['init', '--expect-version=1.0.0'],
      'Unsupported option for `init`: "--expect-version=1.0.0"',
    ],
  ])('%j is refused', (args, message) => {
    expect(refusal(args)).toBe(message);
  });

  it('is listed in the full help, and its page names the option and the git archive line', () => {
    expect(printed(['--help'])).toMatch(
      /^ {2}verify-archive <file> +Check a local pharn-oss \.tar\.gz/m,
    );
    const page = printed(['verify-archive', '--help']);
    expect(page).toContain('pharn verify-archive <file> [options]');
    expect(page).toContain('--expect-version <version>');
    expect(page).toContain('git archive --prefix=pharn-oss/');
    expect(page).not.toContain('--json');
  });
});
