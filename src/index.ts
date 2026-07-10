#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { runInit } from './commands/init.js';
import { runAdd } from './commands/add.js';
import { runRemove } from './commands/remove.js';
import { runUpdate } from './commands/update.js';
import { runList } from './commands/list.js';
import { runStatus } from './commands/status.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const USAGE = `Pharn - Installs PHARN (an audit-grade methodology for Claude Code) into your project. npx pharn init detects your project's archetype and installs the applicable PHARN capabilities into .claude/; pharn add installs another module later; pharn update bumps to the latest skills version.

Usage:
  pharn [command] [options]

Commands:
  init                       Run the setup wizard (default)
  add <module>               Add a methodology module or stack pack
  add <category>:<skill>     Add one technology skill (e.g. orm:prisma)
  remove <module|cat:skill>  Remove a module or skill from this project
  update                     Update installed modules to the latest version
  list                       List installed and available modules/skills
  status                     Show version + local-drift status (read-only)

Options:
      --archetype    init: deprecated no-op — archetype detection is now the default
  -y, --yes          Skip the remove confirmation prompt
      --strict       Make status exit 1 on any outdated/modified/missing file
      --no-drift     Skip the status byte-level drift check
      --json         Emit list output as JSON
  -h, --help         Show this help text
  -v, --version      Show the version number`;

export async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'version', 'json', 'yes', 'strict', 'drift', 'archetype'],
    // `archetype` is retained as a no-op alias for one release: archetype
    // detection is now init's default, so the flag still parses but is not read.
    // `status` drifts by default; `--no-drift` flips it off. minimist defaults
    // bare booleans to false, so set the on-by-default here explicitly.
    default: { drift: true },
    alias: { h: 'help', v: 'version', y: 'yes' },
  });

  if (argv.version) {
    console.log(pkg.version);
    return;
  }

  if (argv.help) {
    console.log(USAGE);
    return;
  }

  const cmd = argv._[0] ?? 'init';

  switch (cmd) {
    case 'init':
      await runInit();
      return;
    case 'add':
      await runAdd(argv._[1]);
      return;
    case 'remove':
    case 'rm':
      await runRemove(argv._[1], { yes: Boolean(argv.yes) });
      return;
    case 'update':
      await runUpdate();
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
