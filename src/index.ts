#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// No command is imported here: the dispatch below `await import()`s the one it
// runs, so `--version`, `--help` and a refused option load neither a command
// nor @clack/prompts (scripts/build.mjs splits the bundle to keep it so).
import { parseCliArgs, USAGE_POINTER } from './lib/cli-args.js';
import { CliError } from './lib/cli-error.js';

export async function main(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const parsed = parseCliArgs(args);

  // A refusal is one stderr line plus the pointer, exit 1, before any command
  // runs. Plain `console.error` (no clack chrome), so a JSON consumer's stdout
  // stays empty. Printed here, then thrown as already reported, so `runCli`
  // sets the code without loading the clack-backed reporter.
  if (parsed.kind === 'refuse') {
    console.error(parsed.message);
    console.error(USAGE_POINTER);
    throw CliError.reported();
  }

  if (parsed.kind === 'print') {
    console.log(parsed.text);
    return;
  }

  const { invocation } = parsed;
  switch (invocation.command) {
    case 'init': {
      const { runInit } = await import('./commands/init.js');
      await runInit(invocation.options);
      return;
    }
    case 'add': {
      const { runAdd } = await import('./commands/add.js');
      await runAdd(invocation.capability);
      return;
    }
    case 'remove': {
      const { runRemove } = await import('./commands/remove.js');
      await runRemove(invocation.capability);
      return;
    }
    case 'update': {
      const { runUpdate } = await import('./commands/update.js');
      await runUpdate(invocation.options);
      return;
    }
    case 'list': {
      const { runList } = await import('./commands/list.js');
      await runList(invocation.options);
      return;
    }
    case 'status': {
      const { runStatus } = await import('./commands/status.js');
      await runStatus(invocation.options);
      return;
    }
    case 'uninstall': {
      const { runUninstall } = await import('./commands/uninstall.js');
      await runUninstall(invocation.options);
      return;
    }
    case 'verify-archive': {
      const { runVerifyArchive } = await import('./commands/verify-archive.js');
      await runVerifyArchive(invocation.options);
      return;
    }
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

/**
 * THE ONE EXIT POINT: commands, steps, lib code and the argv refusal above end
 * a run by throwing a CliError (lib/cli-error.ts), never by exiting, so every
 * `finally` on the way up has run (the temp clone removed, the project lock
 * released). Printed once, the code set as `process.exitCode`, and a normal
 * return, so piped stdout is flushed. Never rejects.
 */
export async function runCli(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  try {
    await main(args);
  } catch (err) {
    // An already-reported refusal needs no printer; anything else loads it
    // only now, so `--version`, `--help` and a refused option stay clack-free.
    if (err instanceof CliError && err.form === 'reported') {
      process.exitCode = err.exitCode;
      return;
    }
    const { reportCliError } = await import('./lib/report-error.js');
    process.exitCode = reportCliError(err);
  }
}

if (isEntryPoint()) {
  void runCli();
}
