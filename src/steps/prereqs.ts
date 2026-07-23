import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cancel } from '@clack/prompts';

// Universal, framework-agnostic gate. Run up-front, before the wizard.
export function runGitPrereq(): void {
  const cwd = process.cwd();

  if (!existsSync(resolve(cwd, '.git'))) {
    fail(
      "✗ git not found.\n  Run: git init && git add -A && git commit -m 'init'\n  Then re-run: npx @pharn-dev/pharn init",
    );
  }
}

function fail(message: string): never {
  cancel(message);
  process.exit(1);
}
