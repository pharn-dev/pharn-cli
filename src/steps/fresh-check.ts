import { execSync } from 'node:child_process';
import { warnAndConfirm } from '../lib/confirm.js';

// A fresh scaffold (e.g. create-next-app + shadcn init) tracks ~25 files in its
// initial commit, so this generous threshold won't fire on the common case —
// it flags a substantial existing codebase committed under a single commit.
export const TRACKED_FILE_THRESHOLD = 40;

export async function runFreshCheck(): Promise<void> {
  const cwd = process.cwd();
  const commits = gitCommitCount(cwd);

  if (commits >= 6) {
    await warnAndConfirm(
      '⚠ This project has significant git history. PHARN works best on fresh projects. For existing projects, see /docs/migrate (coming in v2).',
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

  if (commits <= 1) {
    // A scaffold commonly lands here (create-next-app makes one initial commit),
    // so distinguish a fresh scaffold from a populated repo by tracked-file count.
    if (gitTrackedFileCount(cwd) > TRACKED_FILE_THRESHOLD) {
      await warnAndConfirm(
        '⚠ This project looks customized already. PHARN init is designed for fresh projects. Continuing may conflict with existing files.',
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

export function gitTrackedFileCount(cwd: string): number {
  try {
    const out = execSync('git ls-files', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return out.split('\n').filter((line) => line.trim() !== '').length;
  } catch {
    return 0;
  }
}
