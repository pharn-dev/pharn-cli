import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { warnAndConfirm } from '../lib/confirm.js';

export const CUSTOM_FILE_THRESHOLD = 3;

const KNOWN_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  '.gitignore',
  'tsconfig.json',
  'tsconfig.tsbuildinfo',
  'README.md',
  'components.json',
  'next-env.d.ts',
  '.eslintrc',
  '.eslintrc.json',
]);

const KNOWN_PREFIXES = [
  'next.config.',
  'eslint.config.',
  'postcss.config.',
  'tailwind.config.',
  'prettier.config.',
];

const KNOWN_DIRS = new Set([
  'public',
  'app',
  'pages',
  'node_modules',
  '.git',
  '.next',
  'components',
  'lib',
  'hooks',
  'styles',
]);

const KNOWN_APP_FILES = new Set(['page.tsx', 'layout.tsx', 'globals.css']);

export async function runFreshCheck(): Promise<void> {
  const cwd = process.cwd();
  const commits = gitCommitCount(cwd);

  if (commits >= 6) {
    await warnAndConfirm(
      '⚠ This project has significant history. PHARN works best on fresh Next.js projects. For existing projects, see /docs/migrate (coming in v2).',
      'Continue anyway?',
      false,
    );
    return;
  }

  if (commits >= 2) {
    await warnAndConfirm(
      '⚠ This project has existing commits. PHARN init is designed for fresh projects. Continuing may conflict with existing structure.',
      'Continue anyway?',
      false,
    );
    return;
  }

  if (commits === 0) {
    const custom = countCustomFiles(cwd);
    if (custom > CUSTOM_FILE_THRESHOLD) {
      await warnAndConfirm(
        '⚠ This project looks customized already. PHARN init is designed for fresh Next.js scaffolds. Continuing may conflict with existing files.',
        'Continue anyway?',
        false,
      );
    }
  }
}

export function gitCommitCount(cwd: string): number {
  try {
    const out = execSync('git rev-list --count HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return Number.parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

export function countCustomFiles(cwd: string): number {
  let count = 0;
  for (const entry of readdirSync(cwd)) {
    if (entry.startsWith('.')) continue;
    if (KNOWN_DIRS.has(entry) || KNOWN_FILES.has(entry)) continue;
    if (KNOWN_PREFIXES.some((p) => entry.startsWith(p))) continue;
    const full = resolve(cwd, entry);
    try {
      if (statSync(full).isDirectory()) {
        count += 1;
        continue;
      }
    } catch {
      continue;
    }
    count += 1;
  }
  count += countAppCustomFiles(cwd);
  return count;
}

function countAppCustomFiles(cwd: string): number {
  const appDir = resolve(cwd, 'app');
  if (!existsSync(appDir)) return 0;
  let count = 0;
  for (const entry of readdirSync(appDir)) {
    if (KNOWN_APP_FILES.has(entry)) continue;
    count += 1;
  }
  return count;
}
