// pharn's argv contract: the command and option tables, the help text
// rendered from them, and `parseCliArgs`, the one pure parse. `index.ts`
// prints what it returns and dispatches; nothing here touches the process.
//
// One `util.parseArgs` (strict: false) tokenizes argv; the tokens are then
// checked against the tables, so an option is refused, never parsed and
// dropped. A dropped `--strict` would leave a CI gate green.
import { parseArgs } from 'node:util';
import { REF_CHOICES, type RefChoice } from './release.js';
import { parseArchetypeList } from './archetype.js';
import { escapeUnsafe } from './terminal-safe.js';
import type { Archetype } from '../types.js';
import { PHARN_VERSION } from '../version.js';

const INTRO = `Pharn - Installs and updates PHARN (a workflow for shipping features right with Claude Code) in your git project. npx @pharn-dev/pharn init detects your project's archetype and installs the applicable PHARN capabilities; pharn add installs another capability later; pharn update bumps to the latest skills version.`;

type CommandName =
  'init' | 'add' | 'remove' | 'update' | 'list' | 'status' | 'uninstall';

interface CommandSpec {
  name: CommandName;
  // Present exactly for the commands that take one positional after the word.
  args?: string;
  aliases?: readonly string[];
  summary: string;
  // The sentence on the command's own page, when the summary does not read as one.
  page?: string;
}

const COMMANDS: readonly CommandSpec[] = [
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

interface OptionSpec {
  // The long name parseArgs reports (`no-drift` is its own option).
  key: string;
  short?: string;
  long: string;
  // A value option (`--ref main`); every other option is on/off.
  value?: true;
  // One entry per group of commands the option means the same thing for. The
  // commands listed here are the ONLY ones that take it; an empty `commands`
  // marks a global option.
  uses: readonly {
    commands: readonly CommandName[];
    text: readonly string[];
  }[];
}

const OPTIONS: readonly OptionSpec[] = [
  {
    key: 'archetype',
    long: '--archetype <list>',
    value: true,
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
    value: true,
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
    key: 'no-drift',
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
        text: ['emit the plan as one JSON object (implies --dry-run)'],
      },
      {
        commands: ['init'],
        text: ['emit the plan as one JSON object (implies --dry-run)'],
      },
    ],
  },
  {
    key: 'compact',
    long: '--compact',
    uses: [
      {
        commands: ['update'],
        text: ['omit the unchanged files from the JSON plan (implies --json)'],
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

const isGlobal = (opt: OptionSpec): boolean =>
  opt.uses.some((u) => u.commands.length === 0);

const takesOption = (opt: OptionSpec, cmd: CommandName): boolean =>
  isGlobal(opt) || opt.uses.some((u) => u.commands.includes(cmd));

// One option's lines: every use, prefixed by its commands, or (with
// `forCommand`) only that command's use, unprefixed.
function optionLines(opt: OptionSpec, forCommand?: CommandName): string[] {
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

function commandLabel(c: CommandSpec): string {
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

// `pharn <cmd> --help`: the command's usage line and the options it takes.
function commandUsage(doc: CommandSpec): string {
  const args = doc.args ? ` ${doc.args}` : '';
  const options = OPTIONS.some(
    (opt) => !isGlobal(opt) && takesOption(opt, doc.name),
  )
    ? ' [options]'
    : '';
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
    ...OPTIONS.filter((opt) => takesOption(opt, doc.name)).flatMap((opt) =>
      optionLines(opt, doc.name),
    ),
    '',
    'Run `pharn --help` for every command and the environment variables pharn reads.',
  ].join('\n');
}

// What every refusal prints after its one error line, instead of the whole
// usage text, which would scroll the error off a terminal.
export const USAGE_POINTER = 'Run `pharn --help` for usage.';

export interface InitArgs {
  ref: RefChoice | undefined;
  archetypes: Archetype[] | undefined;
  yes: boolean;
  dryRun: boolean;
  json: boolean;
}

export interface UpdateArgs {
  force: boolean;
  yes: boolean;
  dryRun: boolean;
  json: boolean;
  compact: boolean;
  ref: RefChoice | undefined;
}

// Exactly what each `run<Command>` takes. `add`/`remove` take only their
// positional: `remove` has no `--yes`, because the picker's one confirm is the
// destructive gate nothing may skip.
export type Invocation =
  | { command: 'init'; options: InitArgs }
  | { command: 'add'; capability: string | undefined }
  | { command: 'remove'; capability: string | undefined }
  | { command: 'update'; options: UpdateArgs }
  | { command: 'list'; options: { json: boolean } }
  | {
      command: 'status';
      options: { strict: boolean; drift: boolean; json: boolean };
    }
  | { command: 'uninstall'; options: { yes: boolean } };

export type ParsedArgs =
  // One stderr line; the caller adds USAGE_POINTER and exits 1.
  | { kind: 'refuse'; message: string }
  // `--help` / `--version`: stdout, exit 0, no command runs.
  | { kind: 'print'; text: string }
  | { kind: 'run'; invocation: Invocation };

// The parseArgs config, derived from OPTIONS, so an option with no help
// entry cannot be declared.
const PARSE_OPTIONS = Object.fromEntries(
  OPTIONS.map((opt) => [
    opt.key,
    {
      type: opt.value ? ('string' as const) : ('boolean' as const),
      ...(opt.short === undefined ? {} : { short: opt.short }),
    },
  ]),
);

// Keyed lookups over untrusted names go through Maps, so `toString` or
// `__proto__` is "absent", never an inherited Object.prototype member.
const OPTION_BY_KEY = new Map(OPTIONS.map((opt) => [opt.key, opt]));
const COMMAND_BY_WORD = new Map<string, CommandSpec>(
  COMMANDS.flatMap((c) =>
    [c.name, ...(c.aliases ?? [])].map((word) => [word, c] as const),
  ),
);

// `label: "a", "b"` — offenders escaped (argv is untrusted) and de-duplicated
// (a short bundle yields one token per letter, all naming the same argument).
function refuse(label: string, offenders: readonly string[]): ParsedArgs {
  return {
    kind: 'refuse',
    message: `${label}: ${[...new Set(offenders)].map((o) => JSON.stringify(o)).join(', ')}`,
  };
}

type OptionToken = {
  name: string;
  value?: string;
  inlineValue?: boolean;
  index: number;
};

export function parseCliArgs(args: readonly string[]): ParsedArgs {
  const { tokens } = parseArgs({
    args: [...args],
    options: PARSE_OPTIONS,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const options: OptionToken[] = [];
  const positionals: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'option') options.push(t);
    else if (t.kind === 'positional') positionals.push(t.value);
  }
  // The argument as the user wrote it (`-xz`, `--ref=main`), for messages.
  const written = (t: OptionToken): string => args[t.index]!;

  const word = positionals[0];
  const doc = COMMAND_BY_WORD.get(word ?? 'init');

  // Every name check sits above the --help/--version short-circuits: a
  // genuine --help licenses no bad sibling (`pharn status --help --force`).
  const unknown = options.filter((t) => !OPTION_BY_KEY.has(t.name));
  if (unknown.length > 0) return refuse('Unknown option', unknown.map(written));

  // An unknown command gets no option check, so its own message wins below.
  if (doc !== undefined) {
    const unsupported = options.filter(
      (t) => !takesOption(OPTION_BY_KEY.get(t.name)!, doc.name),
    );
    if (unsupported.length > 0) {
      // The table's literal for the word typed (`rm` stays `rm`), never argv.
      const typed =
        [doc.name, ...(doc.aliases ?? [])].find((w) => w === word) ?? doc.name;
      return refuse(
        `Unsupported option for \`${typed}\``,
        unsupported.map(written),
      );
    }
  }

  const valued = options.filter(
    (t) => OPTION_BY_KEY.get(t.name)!.value !== true && t.inlineValue === true,
  );
  if (valued.length > 0) {
    return refuse('Option takes no value', valued.map(written));
  }

  // parseArgs keeps the last of a repeated value silently. A repeated on/off
  // option cannot disagree with itself, so only value options are checked.
  const repeated = OPTIONS.filter(
    (opt) => opt.value && options.filter((t) => t.name === opt.key).length > 1,
  );
  if (repeated.length > 0) {
    return refuse(
      'Repeated option',
      repeated.map((opt) => `--${opt.key}`),
    );
  }

  const has = (key: string): boolean => options.some((t) => t.name === key);
  // A bare value option (`--ref` last) carries no value: read as ''.
  const valueOf = (key: string): string | undefined => {
    const t = options.find((o) => o.name === key);
    return t === undefined ? undefined : (t.value ?? '');
  };

  const refValue = valueOf('ref');
  const ref =
    refValue === undefined
      ? undefined
      : REF_CHOICES.find((choice) => choice === refValue);
  if (refValue !== undefined && ref === undefined) {
    return refuse(
      `Invalid value for --ref (expected ${REF_CHOICES.map((r) => `"${r}"`).join(' or ')})`,
      [refValue],
    );
  }

  const archetypeValue = valueOf('archetype');
  const archetypes =
    archetypeValue === undefined
      ? undefined
      : parseArchetypeList(archetypeValue);
  if (archetypes === null) {
    return refuse(
      'Invalid value for --archetype (expected a comma-separated list of "ssr", "backend", "spa" — or "lib" alone — each at most once)',
      [archetypeValue!],
    );
  }

  if (has('version')) return { kind: 'print', text: PHARN_VERSION };
  if (has('help')) {
    // A bare `pharn --help` and an unknown command get the full text.
    const page =
      word !== undefined && doc !== undefined ? commandUsage(doc) : USAGE;
    return { kind: 'print', text: page };
  }

  if (doc === undefined) {
    // Only a typed word can miss the table (no word means `init`). Printable
    // input prints as typed; a control character as `\uXXXX`.
    return {
      kind: 'refuse',
      message: `Unknown command: ${escapeUnsafe(word!)}`,
    };
  }

  // The command word plus at most the one positional `args` names.
  const maxPositionals = doc.args === undefined ? 1 : 2;
  if (positionals.length > maxPositionals) {
    return refuse('Unexpected argument', positionals.slice(maxPositionals));
  }

  const json = has('json');
  switch (doc.name) {
    case 'init':
      return run({
        command: 'init',
        options: {
          ref,
          archetypes,
          yes: has('yes'),
          dryRun: has('dry-run') || json,
          json,
        },
      });
    case 'add':
    case 'remove':
      return run({ command: doc.name, capability: positionals[1] });
    case 'update': {
      const compact = has('compact');
      return run({
        command: 'update',
        options: {
          force: has('force'),
          yes: has('yes'),
          dryRun: has('dry-run') || json || compact,
          json: json || compact,
          compact,
          ref,
        },
      });
    }
    case 'list':
      return run({ command: 'list', options: { json } });
    case 'status':
      return run({
        command: 'status',
        options: { strict: has('strict'), drift: !has('no-drift'), json },
      });
    case 'uninstall':
      return run({ command: 'uninstall', options: { yes: has('yes') } });
  }
}

function run(invocation: Invocation): ParsedArgs {
  return { kind: 'run', invocation };
}
