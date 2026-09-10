import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { logError } from '../lib/report-error.js';

// Universal, framework-agnostic gate. Run up-front, before the wizard.
export function runGitPrereq(): void {
  const cwd = process.cwd();

  if (!existsSync(resolve(cwd, '.git'))) {
    fail(
      "git not found.\n  Run: git init && git add -A && git commit -m 'init'\n  Then re-run: npx @pharn-dev/pharn init",
    );
  }
}

// Reported through the shared reporter, NOT clack's `cancel()`.
// `cancel` writes to process.stdout, so this — the one fatal a first-time
// user is most likely to hit — exited 1 with an empty stderr while every
// other fatal in the CLI went through `logError`. It is an error, not a
// user cancellation, and the stream is what says so.
function fail(message: string): never {
  logError(message);
  process.exit(1);
}
