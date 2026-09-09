#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { runInit } from './commands/init.js';
import { runAdd } from './commands/add.js';
import { runRemove } from './commands/remove.js';
import { runUpdate } from './commands/update.js';
import { runList } from './commands/list.js';
import { runStatus } from './commands/status.js';
import { PHARN_VERSION } from './version.js';

const USAGE = `Pharn - Installs PHARN (an audit-grade methodology for Claude Code) into your project. npx @pharn-dev/pharn init detects your project's archetype and installs the applicable PHARN capabilities; pharn add installs another capability later; pharn update bumps to the latest skills version.

Usage:
  pharn [command] [options]

Commands:
  init                       Detect archetypes and install capabilities (default)
  add [capability]           Add a capability, e.g. a11y (no arg: pick interactively)
  remove [capability]        Remove an installed capability (no arg: pick interactively)
  update                     Re-fetch installed capabilities at the latest version
  list                       List installed archetypes + capabilities
  status                     Show version + local-drift status (read-only)

Options (each belongs to ONE command; passing it to another is an error):
      --archetype    init: deprecated no-op — archetype detection is now the default
      --force        update: overwrite files you changed (each is copied to .pharn-backup/ first)
  -y, --yes          update: skip the confirmation prompt (for CI and scripts)
      --strict       status: exit 1 on any outdated/modified/missing file
      --no-drift     status: skip the byte-level drift check
      --json         list: emit the inventory as JSON
  -h, --help         Show this help text
  -v, --version      Show the version number`;

// How many positionals each command accepts, INCLUDING the command word itself.
// A command absent from this table gets no arity check at all, which is what
// keeps `pharn bogus x` on the more useful "Unknown command" path rather than
// pre-empting it with a wrong-shaped arity error.
//
// A `Map`, not an object literal: `cmd` is untrusted argv, and an object lookup
// resolves `Object.prototype` keys — `MAX_POSITIONALS['toString']` would hand
// back a FUNCTION rather than `undefined`. The comparison against it happens to
// be false (`n > fn` is `n > NaN`), so the outcome is right today by accident;
// a Map makes "not in the table" mean exactly that (P5: membership, not a
// coincidence).
const MAX_POSITIONALS = new Map<string, number>([
  ['init', 1],
  ['update', 1],
  ['list', 1],
  ['status', 1],
  ['add', 2],
  ['remove', 2],
  ['rm', 2],
]);

// Which flags each command accepts, by the flag's CANONICAL minimist key
// (`drift`, not `no-drift`). Derived from what each command actually READS —
// `runInit()`, `runAdd(arg)` and `runRemove(arg)` take no options at all, so
// their rows are empty; `--archetype` is init's retained no-op alias.
//
// Before this table, minimist declared every flag globally and the dispatch
// simply did not look at the ones it did not want: `pharn status --json` was
// parsed, dropped, and exited 0 — so `pharn status --json | jq` got clack
// chrome and a success code, permanently disarming a CI gate that still looked
// green.
//
// A `Map` for the same reason MAX_POSITIONALS is one: `cmd` is untrusted argv,
// and an object lookup resolves `Object.prototype` keys — `ALLOWED_FLAGS['toString']`
// would hand back a FUNCTION, and calling `.includes` on it would not even be
// the wrong answer, it would be a crash. A Map makes "not in the table" mean
// exactly that (P5: membership, not a coincidence).
//
// Absent from the table => NO flag check at all, exactly like the arity table,
// which is what keeps `pharn bogus --json` on the more useful "Unknown command"
// path rather than lecturing about a flag on a command that does not exist.
const ALLOWED_FLAGS = new Map<string, readonly string[]>([
  ['init', ['archetype']],
  ['add', []],
  ['remove', []],
  ['rm', []],
  ['update', ['force', 'yes']],
  ['list', ['json']],
  ['status', ['strict', 'drift']],
]);

// Accepted by every command in the table above. They short-circuit below rather
// than dispatching, but they are listed rather than special-cased so that
// `pharn status --help` parses on the per-command pass instead of being reported
// as unsupported.
const GLOBAL_FLAGS = ['help', 'version'];

// The ONE short-alias table, used by both parses: the global one takes it whole,
// the per-command one takes the entries whose canonical target that command
// allows. So `-y` is accepted exactly where `--yes` is, by construction rather
// than by two lists agreeing.
const ALIASES: Readonly<Record<string, string>> = {
  h: 'help',
  v: 'version',
  y: 'yes',
};

// DERIVED, never hand-maintained. A flag declared here but present in no
// command's row is exactly the shape of the bug above, so the global
// declaration list is computed from the per-command table instead of sitting
// beside it waiting to drift.
const DECLARED_BOOLEANS: string[] = [
  ...new Set([...GLOBAL_FLAGS, ...Array.from(ALLOWED_FLAGS.values()).flat()]),
];

// Fires for every arg whose key is not declared — POSITIONALS INCLUDED
// (minimist guards both `setArg` and the `argv._.push`), so a handler that
// returned false unconditionally would drop the command word itself. Let
// anything undashed through and collect only the flags. A declared boolean
// never arrives here, so `--no-drift` and the `-h`/`-v`/`-y` aliases are
// untouched.
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

// Which of the flags on the command line this command does not take.
//
// It re-parses the SAME argv under just this command's declarations and keeps
// only minimist's own `unknown` verdicts. Deliberately not derived from the
// already-parsed `argv`: minimist assigns `false` to EVERY declared boolean
// whether or not it was passed, so `Object.keys(argv)` cannot tell "passed"
// from "defaulted", and the value-differs workaround (`argv.json !== false`)
// reads `--json=false` as absent — a guess where a membership test is available
// (P5).
//
// Re-parsing keeps the tokenizer minimist's, so `--no-x`, `=value`, short
// bundles and the `--` terminator are classified exactly as the real parse
// classifies them, rather than by a second scanner that would have to agree
// with the first forever. Only the offender list is kept; this pass's `_` is
// discarded, since an undeclared flag can swallow the token after it.
function unsupportedFlags(allowed: readonly string[]): string[] {
  const offenders: string[] = [];
  const declared = [...GLOBAL_FLAGS, ...allowed];
  minimist(process.argv.slice(2), {
    boolean: declared,
    alias: aliasesFor(declared),
    unknown: collectFlags(offenders),
  });
  return offenders;
}

// Refuse argv we do not understand: print the offenders + the usage text to
// STDERR and exit 1. `console.error`, not the shared reporter, exactly like the
// unknown-command path below — `pharn list --json --bogus` must stay parseable
// for a JSON consumer, and clack chrome in a `2>&1` capture is not that.
//
// Offenders are `JSON.stringify`-escaped: argv is untrusted text (P2), so a
// control-char argument is echoed as data, never raw — mirroring how
// `lib/seam-config.ts` names an unknown config key.
//
// De-duplicated because minimist reports a short BUNDLE once per unknown letter
// in it, naming the whole token each time: `pharn status -xz` used to print
// `"-xz", "-xz"`. The offenders are a set of names, not a count of hits.
function refuse(label: string, offenders: string[]): never {
  console.error(
    `${label}: ${[...new Set(offenders)].map((o) => JSON.stringify(o)).join(', ')}\n`,
  );
  console.error(USAGE);
  process.exit(1);
}

export async function main(): Promise<void> {
  // Collected by the `unknown` callback below, then gated before ANY dispatch.
  const unknownOptions: string[] = [];
  const argv = minimist(process.argv.slice(2), {
    // Derived from ALLOWED_FLAGS, so a flag can never be declared here without
    // belonging to some command's row.
    boolean: DECLARED_BOOLEANS,
    // `_` stays a STRING array. Without this minimist coerces a numeric-looking
    // positional (`pharn add 123`) to the NUMBER 123, which reaches
    // `parseCapabilityArg` and dies on `.includes(':')` with a raw TypeError
    // stack instead of the curated "valid capabilities" listing. `@types/minimist`
    // declares `_: string[]`, so the type checker never saw the lie.
    string: ['_'],
    // `archetype` is retained as a no-op alias for one release: archetype
    // detection is now init's default, so the flag still parses but is not read.
    // `status` drifts by default; `--no-drift` flips it off. minimist defaults
    // bare booleans to false, so set the on-by-default here explicitly.
    default: { drift: true },
    alias: ALIASES,
    unknown: collectFlags(unknownOptions),
  });

  // BEFORE the --version / --help short-circuits, deliberately. A typo'd
  // `--hepl` is caught wherever this sits (`help` is a declared boolean, so it
  // parses as `{ help: false, hepl: true }` and misses the short-circuit anyway,
  // then falls through to `argv._[0] ?? 'init'` and starts a real install). What
  // the ordering actually decides is `pharn --help --bogus` / `--version
  // --bogus`: after the short-circuits they print usage or the version and
  // swallow the typo; here they refuse. A genuine --help does not license an
  // unknown sibling.
  if (unknownOptions.length > 0) refuse('Unknown option', unknownOptions);

  const cmd = argv._[0] ?? 'init';

  // ALSO before the short-circuits, and for the same reason the gate above is:
  // a genuine `--help` does not license a sibling this command cannot use.
  // `pharn status --help --json` refuses rather than printing usage and
  // swallowing the `--json`, which is the same call the plain gate makes about
  // `--bogus`. `pharn status --help` itself is unaffected — `help` and
  // `version` are in every row.
  //
  // A command absent from the table is not checked at all, so `pharn bogus
  // --json` still reaches the "Unknown command" default below. That absence is
  // also what makes the interpolated `cmd` in the label safe: it is only
  // reachable once the Map lookup has hit, so it is one of the seven literal
  // keys rather than arbitrary argv (P2).
  const allowedFlags = ALLOWED_FLAGS.get(cmd);
  if (allowedFlags !== undefined) {
    const unsupported = unsupportedFlags(allowedFlags);
    if (unsupported.length > 0) {
      refuse(`Unsupported option for \`${cmd}\``, unsupported);
    }
  }

  if (argv.version) {
    console.log(PHARN_VERSION);
    return;
  }

  if (argv.help) {
    console.log(USAGE);
    return;
  }

  // Extra positionals used to be silently ignored: `pharn add a11y extra`
  // dropped the third token because the dispatch reads only `argv._[1]`.
  const maxPositionals = MAX_POSITIONALS.get(cmd);
  if (maxPositionals !== undefined && argv._.length > maxPositionals) {
    refuse('Unexpected argument', argv._.slice(maxPositionals));
  }

  switch (cmd) {
    case 'init':
      await runInit();
      return;
    case 'add':
      await runAdd(argv._[1]);
      return;
    case 'remove':
    case 'rm':
      // The argument alone, exactly like `add` above: `remove` has no `--yes`.
      // Its named path never confirms (nothing to skip) and its picker's ONE
      // confirm is the destructive gate (nothing MAY skip it), so there is no
      // consumer for an option object here. `remove`'s ALLOWED_FLAGS row is
      // therefore empty, and `pharn remove --yes` is now refused up front
      // rather than parsed and dropped — the per-command allowlist this comment
      // used to defer to.
      await runRemove(argv._[1]);
      return;
    case 'update':
      await runUpdate({ force: Boolean(argv.force), yes: Boolean(argv.yes) });
      return;
    case 'list':
      await runList({ json: Boolean(argv.json) });
      return;
    case 'status':
      await runStatus({
        strict: Boolean(argv.strict),
        drift: argv.drift !== false,
      });
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(USAGE);
      process.exit(1);
  }
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
