import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { logError, logErrorPlain } from '../lib/report-error.js';
import { escapeUnsafe } from '../lib/terminal-safe.js';

// The git prerequisite, run up-front. `json` (init --dry-run --json): one plain
// stderr line, no clack chrome, stdout untouched.
export function runGitPrereq(opts: { json?: boolean } = {}): void {
  const cwd = process.cwd();

  if (!existsSync(resolve(cwd, '.git'))) {
    // Below a repository's root (a monorepo's `apps/web`): "git init" would
    // create a NESTED repository, so name the root instead. The paths are
    // display data, escaped.
    const root = findAncestorGitRoot(cwd);
    fail(
      root === null
        ? "git not found.\n  Run: git init && git add -A && git commit -m 'init'\n  Then re-run: npx @pharn-dev/pharn init"
        : `${escapeUnsafe(cwd)} is inside the git repository at ${escapeUnsafe(root)}, not at its root.\n  Run \`pharn init\` from the repository root (${escapeUnsafe(root)}).`,
      opts.json ?? false,
    );
  }
}

/**
 * The nearest STRICT ancestor of `start` that holds a `.git` (a directory, or
 * the file a worktree or submodule has — the same `existsSync` test as the cwd
 * check above), or null when none does up to the filesystem root. Read-only.
 */
export function findAncestorGitRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
    if (existsSync(join(dir, '.git'))) return dir;
  }
}

// Through the shared reporter, NOT clack's `cancel()`, which writes to stdout:
// this is an error, not a user cancellation.
function fail(message: string, json: boolean): never {
  if (json) logErrorPlain(message);
  else logError(message);
  process.exit(1);
}
