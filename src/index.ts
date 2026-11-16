#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
// No command is imported here: the dispatch below `await import()`s the one it
// runs, so `--version`, `--help` and a refused option load neither a command
// nor @clack/prompts (scripts/build.mjs splits the bundle to keep it so).
import { REF_CHOICES, type RefChoice } from './lib/release.js';
import { parseArchetypeList } from './lib/archetype.js';
import type { Archetype } from './types.js';
import { PHARN_VERSION } from './version.js';

const INTRO = `Pharn - Installs and updates PHARN (a workflow for shipping features right with Claude Code) in your git project. npx @pharn-dev/pharn init detects your project's archetype and installs the applicable PHARN capabilities; pharn add installs another capability later; pharn update bumps to the latest skills version.`;

// The help text is DATA, rendered two ways (`pharn --help`: everything;
// `pharn <cmd> --help`: that command's ALLOWED_FLAGS row), so the two cannot
// describe an option differently.
interface CommandHelp {
  name: string;
  args?: string;
  aliases?: readonly string[];
  summary: string;
  // The sentence on the command's own page, when the summary does not read as one.
  page?: string;
}

const COMMANDS: readonly CommandHelp[] = [
  {
    name: 'init',
    summary: 'Detect archetypes and install capabilities (default)',
    page: 'Detect archetypes and install capabilities. The default command: `pharn` alone runs it.',
  },
  {
    name: 'add',
    args: '[capability]',
    summary: 'Add a capability, e.g. a11y (no arg: pick interactively)',
  },
  {
    name: 'remove',
    args: '[capability]',
    aliases: ['rm'],
    summary: 'Remove an installed capability (no arg: pick interactively)',
  },
  {
    name: 'update',
    summary: 'Re-fetch installed capabilities at the latest version',
  },
  { name: 'list', summary: 'List installed archetypes + capabilities' },
  { name: 'status', summary: 'Show version + local-drift status (read-only)' },
  {
    name: 'uninstall',
    summary: 'Remove the PHARN files pharn wrote and you did not change',
  },
];

interface OptionHelp {
  // The canonical minimist key, as ALLOWED_FLAGS names it (`drift`, not `no-drift`).
  key: string;
  short?: string;
  long: string;
  // One entry per group of commands the option means the same thing for; an
  // empty `commands` marks a global option.
  uses: readonly { commands: readonly string[]; text: readonly string[] }[];
}

const OPTIONS: readonly OptionHelp[] = [
  {
    key: 'archetype',
    long: '--archetype <list>',
    uses: [
      {
        commands: ['init'],
        text: [
          'use these archetypes instead of detecting them — a',
          'comma-separated list of ssr, backend, spa (or lib alone)',
        ],
      },
    ],
  },
  {
    key: 'ref',
    long: '--ref <ref>',
    uses: [
      {
        commands: ['init'],
        text: [
          'install from "latest" (the newest verified pharn-oss',
          'release — the default) or "main" (its tip, for',
          'contributors); recorded',
        ],
      },
      {
        commands: ['update'],
        text: [
          'switch to "latest" (verified releases) or "main" (the',
          'tip); recorded — without it, update follows the',
          'channel the install records (main when none is)',
        ],
      },
    ],
  },
  {
    key: 'force',
    long: '--force',
    uses: [
      {
        commands: ['update'],
        text: [
          'overwrite files you changed (each is copied to pharn/.backup/ first)',
        ],
      },
    ],
  },
  {
    key: 'yes',
    short: 'y',
    long: '--yes',
    uses: [
      {
        commands: ['update', 'uninstall'],
        text: ['skip the confirmation prompt (for CI and scripts)'],
      },
      {
        commands: ['init'],
        text: [
          'install without prompts — only when no file would be overwritten',
        ],
      },
    ],
  },
  {
    key: 'dry-run',
    long: '--dry-run',
    uses: [
      {
        commands: ['update'],
        text: ['show what would change and write nothing'],
      },
      {
        commands: ['init'],
        text: ['show what would be installed and write nothing'],
      },
    ],
  },
  {
    key: 'strict',
    long: '--strict',
    uses: [
      {
        commands: ['status'],
        text: ['exit 1 on any outdated/modified/missing file'],
      },
    ],
  },
  {
    key: 'drift',
    long: '--no-drift',
    uses: [{ commands: ['status'], text: ['skip the byte-level drift check'] }],
  },
  {
    key: 'json',
    long: '--json',
    uses: [
      { commands: ['list'], text: ['emit the inventory as JSON'] },
      {
        commands: ['status'],
        text: ['emit one JSON report on stdout (diagnostics on stderr)'],
      },
      {
        commands: ['update'],
        text: ['with --dry-run, emit the plan as one JSON object'],
      },
      {
        commands: ['init'],
        text: ['with --dry-run, emit the plan as one JSON object'],
      },
    ],
  },
  {
    key: 'compact',
    long: '--compact',
    uses: [
      {
        commands: ['update'],
        text: [
          "with --dry-run --json, omit the unchanged files from the plan's file list",
        ],
      },
    ],
  },
  {
    key: 'help',
    short: 'h',
    long: '--help',
    uses: [{ commands: [], text: ['Show this help text'] }],
  },
  {
    key: 'version',
    short: 'v',
    long: '--version',
    uses: [{ commands: [], text: ['Show the version number'] }],
  },
];

// What pharn reads from the environment (proxy rules in full: lib/proxy-env.ts).
const ENVIRONMENT = `Environment:
  PHARN_DEBUG=1              Print the full error (stack trace) when a download or
                             install fails, instead of a one-line hint
  NODE_USE_ENV_PROXY=1       Let Node's fetch use https_proxy / HTTPS_PROXY (or
                             http_proxy / HTTP_PROXY, honouring NO_PROXY); without it, or
                             Node's --use-env-proxy, pharn's downloads connect directly,
                             and pharn says which applies whenever a proxy variable is set
  NO_COLOR=1                 Turn colored output off (FORCE_COLOR=1 turns it on)`;

const DESCRIPTION_COLUMN = 21;
const COMMAND_COLUMN = 29;

// One option's lines: every use, prefixed by its commands, or (with
// `forCommand`) only that command's use, unprefixed.
function optionLines(opt: OptionHelp, forCommand?: string): string[] {
  const uses =
    forCommand === undefined
      ? opt.uses
      : opt.uses.filter(
          (u) => u.commands.length === 0 || u.commands.includes(forCommand),
        );
  const body = uses.flatMap(({ commands, text }) =>
    text.map((line, i) =>
      i === 0 && forCommand === undefined && commands.length > 0
        ? `${commands.join(', ')}: ${line}`
        : line,
    ),
  );
  const indent = ' '.repeat(DESCRIPTION_COLUMN);
  const head = `  ${opt.short ? `-${opt.short}, ` : '    '}${opt.long}`;
  // A label too wide for the column gets its own line (`--archetype <list>`).
  if (head.length + 2 > DESCRIPTION_COLUMN) {
    return [head, ...body.map((line) => indent + line)];
  }
  const [first, ...rest] = body;
  return [
    head.padEnd(DESCRIPTION_COLUMN) + (first ?? ''),
    ...rest.map((line) => indent + line),
  ];
}

function commandLabel(c: CommandHelp): string {
  const names = [c.name, ...(c.aliases ?? [])].join(', ');
  return c.args ? `${names} ${c.args}` : names;
}

const USAGE = [
  INTRO,
  '',
  'Usage:',
  '  pharn [command] [options]',
  '',
  'Commands:',
  ...COMMANDS.map(
    (c) => `  ${commandLabel(c).padEnd(COMMAND_COLUMN - 2)}${c.summary}`,
  ),
  '',
  'Options (each belongs to ONE command; passing it to another is an error):',
  ...OPTIONS.flatMap((opt) => optionLines(opt)),
  '',
  ENVIRONMENT,
  '',
  'Run `pharn <command> --help` for one command and only its options.',
].join('\n');

// What every refusal prints after its one error line, instead of the whole
// usage text, which scrolled the error off a terminal.
const USAGE_POINTER = 'Run `pharn --help` for usage.';

// How many positionals each command accepts, INCLUDING the command word. An
// absent command gets no arity check, so `pharn bogus x` reaches "Unknown
// command". A `Map` because `cmd` is untrusted argv and an object lookup would
// resolve `Object.prototype` keys.
const MAX_POSITIONALS = new Map<string, number>([
  ['init', 1],
  ['update', 1],
  ['list', 1],
  ['status', 1],
  ['uninstall', 1],
  ['add', 2],
  ['remove', 2],
  ['rm', 2],
]);

// Which flags each command accepts, by CANONICAL minimist key, derived from
// what each command READS (`add`/`remove` take none). A flag a command does not
// take is refused, never parsed and dropped — a dropped `--strict` would leave
// a CI gate green. A `Map`, absent row = no check, like MAX_POSITIONALS.
const ALLOWED_FLAGS = new Map<string, readonly string[]>([
  ['init', ['archetype', 'ref', 'yes', 'dry-run', 'json']],
  ['add', []],
  ['remove', []],
  ['rm', []],
  ['update', ['force', 'yes', 'ref', 'dry-run', 'json', 'compact']],
  ['list', ['json']],
  ['status', ['strict', 'drift', 'json']],
  ['uninstall', ['yes']],
]);

// Flags valid only TOGETHER with another, per command: `flag` is refused unless
// `requires` is also passed. `--json` is the dry run's machine-readable form; a
// real run prompts and prints clack chrome. Absent row = no check. Presence is
// read as the dispatch reads it, so `--dry-run=false --json` is refused.
const REQUIRED_WITH = new Map<
  string,
  readonly { flag: string; requires: string }[]
>([
  [
    'update',
    [
      { flag: 'json', requires: 'dry-run' },
      { flag: 'compact', requires: 'json' },
    ],
  ],
  ['init', [{ flag: 'json', requires: 'dry-run' }]],
]);

// Accepted by every command (listed, not special-cased, so `pharn status
// --help` parses on the per-command pass).
const GLOBAL_FLAGS = ['help', 'version'];
// `pharn <cmd> --help`: the command's usage line and the options its row
// grants; `undefined` for a command with no page (the full text then prints).
function commandUsage(cmd: string): string | undefined {
  const doc = COMMANDS.find(
    (c) => c.name === cmd || (c.aliases ?? []).includes(cmd),
  );
  const allowed = ALLOWED_FLAGS.get(cmd);
  if (doc === undefined || allowed === undefined) return undefined;
  const args = doc.args ? ` ${doc.args}` : '';
  const options = allowed.length > 0 ? ' [options]' : '';
  return [
    'Usage:',
    `  pharn ${doc.name}${args}${options}`,
    ...(doc.aliases ?? []).map(
      (a) => `  pharn ${a}${args}${options}   (alias)`,
    ),
    '',
    doc.page ?? `${doc.summary}.`,
    '',
    'Options:',
    ...OPTIONS.filter(
      (opt) => GLOBAL_FLAGS.includes(opt.key) || allowed.includes(opt.key),
    ).flatMap((opt) => optionLines(opt, doc.name)),
    '',
    'Run `pharn --help` for every command and the environment variables pharn reads.',
  ].join('\n');
}

// The ONE short-alias table, used by both parses, so `-y` is accepted exactly
// where `--yes` is.
const ALIASES: Readonly<Record<string, string>> = {
  h: 'help',
  v: 'version',
  y: 'yes',
};

// The flags that take a VALUE (`--ref main`); every other flag is a boolean.
const STRING_FLAGS: ReadonlySet<string> = new Set(['ref', 'archetype']);

// DERIVED from ALLOWED_FLAGS, so a flag declared for no command is
// unrepresentable.
const DECLARED_FLAGS: string[] = [
  ...new Set([...GLOBAL_FLAGS, ...Array.from(ALLOWED_FLAGS.values()).flat()]),
];
const DECLARED_BOOLEANS = DECLARED_FLAGS.filter((f) => !STRING_FLAGS.has(f));
const DECLARED_STRINGS = DECLARED_FLAGS.filter((f) => STRING_FLAGS.has(f));

// minimist calls `unknown` for undeclared POSITIONALS too, so let anything
// undashed through and collect only the flags.
function collectFlags(offenders: string[]): (arg: string) => boolean {
  return (arg) => {
    if (!arg.startsWith('-')) return true;
    offenders.push(arg);
    return false;
  };
}

function aliasesFor(declared: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ALIASES).filter(([, canonical]) =>
      declared.includes(canonical),
    ),
  );
}

// Which of the flags on the command line this command does not take: a second
// minimist parse under just its declarations, keeping only the `unknown`
// verdicts. Not derived from the parsed `argv`, where a defaulted boolean
// (`false`) is indistinguishable from a passed one. This pass's `_` is
// discarded (an undeclared flag can swallow the next token).
function unsupportedFlags(allowed: readonly string[]): string[] {
  const offenders: string[] = [];
  const declared = [...GLOBAL_FLAGS, ...allowed];
  minimist(process.argv.slice(2), {
    boolean: declared.filter((f) => !STRING_FLAGS.has(f)),
    string: declared.filter((f) => STRING_FLAGS.has(f)),
    alias: aliasesFor(declared),
    unknown: collectFlags(offenders),
  });
  return offenders;
}

// The `{ flag, requires }` pairs `cmd` passed without the flag they need, as the
// text the refusal names. Literal flag names from the table, never argv.
function unmetRequirements(
  cmd: string,
  argv: Record<string, unknown>,
): string[] {
  return (REQUIRED_WITH.get(cmd) ?? [])
    .filter(({ flag, requires }) => Boolean(argv[flag]) && !argv[requires])
    .map(({ flag, requires }) => `--${flag} (needs --${requires})`);
}

// Refuse argv we do not understand: ONE stderr line naming the offenders plus
// the usage pointer, exit 1. Plain `console.error` (no clack chrome), so a JSON
// consumer's capture stays clean. Offenders are `JSON.stringify`-escaped (argv
// is untrusted) and de-duplicated (minimist names a short bundle once per
// unknown letter).
function refuse(label: string, offenders: string[]): never {
  console.error(
    `${label}: ${[...new Set(offenders)].map((o) => JSON.stringify(o)).join(', ')}`,
  );
  console.error(USAGE_POINTER);
  process.exit(1);
}

export async function main(): Promise<void> {
  // Collected by the `unknown` callback below, then gated before ANY dispatch.
  const unknownOptions: string[] = [];
  const argv = minimist(process.argv.slice(2), {
    boolean: DECLARED_BOOLEANS,
    // `_` stays a STRING array: minimist would coerce `pharn add 123` to a
    // NUMBER, which `@types/minimist` (`_: string[]`) hides from the checker.
    // The value flags are declared so `--ref main` binds `main` to `ref`.
    string: ['_', ...DECLARED_STRINGS],
    // `status` drifts by default; `--no-drift` flips it off.
    default: { drift: true },
    alias: ALIASES,
    unknown: collectFlags(unknownOptions),
  });

  // BEFORE the --version / --help short-circuits: a genuine --help does not
  // license an unknown sibling (`pharn --help --bogus` refuses).
  if (unknownOptions.length > 0) refuse('Unknown option', unknownOptions);

  const cmd = argv._[0] ?? 'init';

  // Also before the short-circuits, for the same reason (`pharn status --help
  // --force` refuses). Reached only when the Map lookup hit, so the
  // interpolated `cmd` is one of the table's literal keys, never raw argv.
  const allowedFlags = ALLOWED_FLAGS.get(cmd);
  if (allowedFlags !== undefined) {
    const unsupported = unsupportedFlags(allowedFlags);
    if (unsupported.length > 0) {
      refuse(`Unsupported option for \`${cmd}\``, unsupported);
    }
  }

  // One level finer: a flag passed without the flag it depends on. Non-empty
  // only for REQUIRED_WITH's keys, so `cmd` is again a literal.
  const unmet = unmetRequirements(cmd, argv);
  if (unmet.length > 0) refuse(`Incomplete option for \`${cmd}\``, unmet);

  // `--ref`'s VALUE, also before the short-circuits.
  const ref = refOption(argv.ref);
  if (ref === null) {
    refuse(
      `Invalid value for --ref (expected ${REF_CHOICES.map((r) => `"${r}"`).join(' or ')})`,
      [typeof argv.ref === 'string' ? argv.ref : JSON.stringify(argv.ref)],
    );
  }

  // `--archetype`'s VALUE, likewise.
  const archetypes = archetypeOption(argv.archetype);
  if (archetypes === null) {
    refuse(
      'Invalid value for --archetype (expected a comma-separated list of "ssr", "backend", "spa" — or "lib" alone — each at most once)',
      [
        typeof argv.archetype === 'string'
          ? argv.archetype
          : JSON.stringify(argv.archetype),
      ],
    );
  }

  if (argv.version) {
    console.log(PHARN_VERSION);
    return;
  }

  if (argv.help) {
    // A bare `pharn --help` (no command word) and a command with no page get
    // the full text.
    const page = argv._[0] === undefined ? undefined : commandUsage(cmd);
    console.log(page ?? USAGE);
    return;
  }

  // The dispatch reads only `argv._[1]`, so extra positionals are refused.
  const maxPositionals = MAX_POSITIONALS.get(cmd);
  if (maxPositionals !== undefined && argv._.length > maxPositionals) {
    refuse('Unexpected argument', argv._.slice(maxPositionals));
  }

  switch (cmd) {
    case 'init': {
      const { runInit } = await import('./commands/init.js');
      await runInit({
        ref,
        archetypes,
        yes: Boolean(argv.yes),
        dryRun: Boolean(argv['dry-run']),
        json: Boolean(argv.json),
      });
      return;
    }
    case 'add': {
      const { runAdd } = await import('./commands/add.js');
      await runAdd(argv._[1]);
      return;
    }
    case 'remove':
    case 'rm': {
      // No `--yes`: the named path never confirms, and the picker's one
      // confirm is the destructive gate nothing may skip.
      const { runRemove } = await import('./commands/remove.js');
      await runRemove(argv._[1]);
      return;
    }
    case 'update': {
      const { runUpdate } = await import('./commands/update.js');
      await runUpdate({
        force: Boolean(argv.force),
        yes: Boolean(argv.yes),
        dryRun: Boolean(argv['dry-run']),
        json: Boolean(argv.json),
        compact: Boolean(argv.compact),
        ref,
      });
      return;
    }
    case 'list': {
      const { runList } = await import('./commands/list.js');
      await runList({ json: Boolean(argv.json) });
      return;
    }
    case 'status': {
      const { runStatus } = await import('./commands/status.js');
      await runStatus({
        strict: Boolean(argv.strict),
        drift: argv.drift !== false,
        json: Boolean(argv.json),
      });
      return;
    }
    case 'uninstall': {
      const { runUninstall } = await import('./commands/uninstall.js');
      await runUninstall({ yes: Boolean(argv.yes) });
      return;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(USAGE_POINTER);
      process.exit(1);
  }
}

// `--ref`: absent → `undefined` (each command picks its default); one of
// REF_CHOICES → that choice; anything else (`''`, `false` from `--no-ref`, an
// array from a repeated flag) → `null`, which the dispatch refuses.
function refOption(value: unknown): RefChoice | undefined | null {
  if (value === undefined) return undefined;
  return REF_CHOICES.find((choice) => choice === value) ?? null;
}

// `--archetype`: absent → `undefined` (init detects); a string in the exact
// grammar → those archetypes in canonical order; anything else → `null`.
function archetypeOption(value: unknown): Archetype[] | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? parseArchetypeList(value) : null;
}

// Auto-run only when invoked as the CLI entry point (dev: `tsx src/index.ts`,
// prod: the `dist/index.js` bin) — not when imported, e.g. by tests.
function isEntryPoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
