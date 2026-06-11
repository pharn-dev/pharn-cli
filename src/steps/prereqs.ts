import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cancel } from '@clack/prompts';

export function runPrereqs(): void {
  const cwd = process.cwd();

  if (!hasNextDependency(cwd)) {
    fail(
      '✗ Next.js not found.\n  Run: npx create-next-app@latest\n  Then re-run: npx pharn init',
    );
  }

  if (!existsSync(resolve(cwd, '.git'))) {
    fail(
      "✗ git not found.\n  Run: git init && git add -A && git commit -m 'init'\n  Then re-run: npx pharn init",
    );
  }
}

export function hasNextDependency(cwd: string): boolean {
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.next ?? pkg.devDependencies?.next);
  } catch {
    return false;
  }
}

function fail(message: string): never {
  cancel(message);
  process.exit(1);
}
