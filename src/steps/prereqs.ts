import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { logError, logErrorPlain } from '../lib/report-error.js';
import { escapeUnsafe } from '../lib/terminal-safe.js';

// Universal, framework-agnostic gate. Run up-front, before the wizard.
// `json` (init --dry-run --json) keeps the clack chrome out: one plain stderr
// line, stdout untouched.
export function runGitPrereq(opts: { json?: boolean } = {}): void {
  const cwd = process.cwd();

  if (!existsSync(resolve(cwd, '.git'))) {
    // Inside a repository but below its root (a monorepo's `apps/web`):
    // "git init" here would create a NESTED repository, so name the root
    // instead (CORE-168). The paths are the user's own directory names —
    // display data, escaped like every local path pharn prints.
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

// Reported through the shared reporter, NOT clack's `cancel()`.
// `cancel` writes to process.stdout, so this — the one fatal a first-time
// user is most likely to hit — exited 1 with an empty stderr while every
// other fatal in the CLI went through `logError`. It is an error, not a
// user cancellation, and the stream is what says so.
function fail(message: string, json: boolean): never {
  if (json) logErrorPlain(message);
  else logError(message);
  process.exit(1);
}
