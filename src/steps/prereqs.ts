import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cancel } from '@clack/prompts';
import type { ManifestModule, ModulePrerequisite } from '../types.js';

// Universal, framework-agnostic gate. Run up-front, before the wizard.
export function runGitPrereq(): void {
  const cwd = process.cwd();

  if (!existsSync(resolve(cwd, '.git'))) {
    fail(
      "✗ git not found.\n  Run: git init && git add -A && git commit -m 'init'\n  Then re-run: npx pharn init",
    );
  }
}

/**
 * Conditional gate: fail when a module in the resolved install set declares a
 * prerequisite package that is absent from the project's dependencies. The
 * package set is driven entirely by the manifest (e.g. pharn-stack-nextjs
 * declares `next`), so a no-pack / non-Next install simply has nothing to
 * satisfy. Every missing prerequisite is collected and reported together.
 *
 * Used by `init` (after stack-pack selection) and `add` (before any fetch), so
 * both fail before a single file is written. `rerun` tailors the closing hint
 * to the command the user actually ran.
 */
export function assertPrerequisites(
  modules: ManifestModule[],
  cwd: string = process.cwd(),
  rerun = 'npx pharn init',
): void {
  const installed = readProjectPackages(cwd);
  const missing: ModulePrerequisite[] = [];
  const seen = new Set<string>();
  for (const mod of modules) {
    for (const pre of mod.prerequisites ?? []) {
      if (!installed.has(pre.package) && !seen.has(pre.package)) {
        seen.add(pre.package);
        missing.push(pre);
      }
    }
  }
  if (missing.length > 0) {
    const body = missing.map((pre) => `✗ ${pre.reason}`).join('\n');
    fail(`${body}\n  Then re-run: ${rerun}`);
  }
}

// Names of every package in the project's dependencies + devDependencies. A
// missing or malformed package.json yields an empty set (nothing satisfied).
export function readProjectPackages(cwd: string): Set<string> {
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) return new Set();
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

function fail(message: string): never {
  cancel(message);
  process.exit(1);
}
