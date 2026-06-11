#!/usr/bin/env node
import { createRequire } from 'node:module';
import minimist from 'minimist';
import { runInit } from './commands/init.js';
import { runAdd } from './commands/add.js';
import { runUpdate } from './commands/update.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const USAGE = `Pharn - Installs PHARN (an audit-grade methodology for Claude Code) into your project. npx pharn init picks your modules + stack pack and copies them into .claude/; pharn add installs another module later; pharn update bumps to the latest skills version.

Usage:
  pharn [command] [options]

Commands:
  init               Run the setup wizard (default)
  add <module>       Add a module to an existing PHARN project
  update             Update installed modules to the latest version

Options:
  -h, --help         Show this help text
  -v, --version      Show the version number`;

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'version'],
    alias: { h: 'help', v: 'version' },
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
    case 'update':
      await runUpdate();
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
