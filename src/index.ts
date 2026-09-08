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

Options:
      --archetype    init: deprecated no-op — archetype detection is now the default
      --force        update: overwrite files you changed (each is copied to .pharn-backup/ first)
  -y, --yes          update: skip the confirmation prompt (for CI and scripts)
      --strict       Make status exit 1 on any outdated/modified/missing file
      --no-drift     Skip the status byte-level drift check
      --json         Emit list output as JSON
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

// Refuse argv we do not understand: print the offenders + the usage text to
// STDERR and exit 1. `console.error`, not the shared reporter, exactly like the
// unknown-command path below — `pharn list --json --bogus` must stay parseable
// for a JSON consumer, and clack chrome in a `2>&1` capture is not that.
//
// Offenders are `JSON.stringify`-escaped: argv is untrusted text (P2), so a
// control-char argument is echoed as data, never raw — mirroring how
// `lib/seam-config.ts` names an unknown config key.
function refuse(label: string, offenders: string[]): never {
  console.error(
    `${label}: ${offenders.map((o) => JSON.stringify(o)).join(', ')}\n`,
  );
  console.error(USAGE);
  process.exit(1);
}

export async function main(): Promise<void> {
  // Collected by the `unknown` callback below, then gated before ANY dispatch.
  const unknownOptions: string[] = [];
  const argv = minimist(process.argv.slice(2), {
    boolean: [
      'help',
      'version',
      'json',
      'yes',
      'strict',
      'drift',
      'archetype',
      'force',
    ],
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
    alias: { h: 'help', v: 'version', y: 'yes' },
    // Fires for every arg whose key is not declared above — POSITIONALS INCLUDED
    // (minimist guards both `setArg` and the `argv._.push`), so a handler that
    // returned false unconditionally would drop the command word itself. Let
    // anything undashed through and collect only the flags. A declared boolean
    // never arrives here, so `--no-drift` and the `-h`/`-v`/`-y` aliases are
    // untouched.
    unknown: (arg) => {
      if (!arg.startsWith('-')) return true;
      unknownOptions.push(arg);
      return false;
    },
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

  if (argv.version) {
    console.log(PHARN_VERSION);
    return;
  }

  if (argv.help) {
    console.log(USAGE);
    return;
  }

  const cmd = argv._[0] ?? 'init';

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
      // `--yes` is a documented no-op here (remove has no confirm prompt to
      // skip). Whether the passthrough should exist at all is FABLE 4.07's
      // question, not this gate's — left exactly as it was so that decision
      // stays findable rather than pre-empted.
      await runRemove(argv._[1], { yes: Boolean(argv.yes) });
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
