import { lstatSync, readdirSync } from 'node:fs';
import { AGENTS_FROM_SKILLS_VERSION, CLAUDE_AGENTS_DIR } from './constants.js';
import { isProductAgentFile } from './install-manifest.js';
import { compareVersionCore } from './semver.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';

/**
 * Is an install at `skillsVersion` PROVABLY missing its `.claude/agents/`
 * agent definition? The local, read-only check that re-opens `pharn update`'s
 * same-version early return for it (CORE-272).
 *
 * pharn-oss ships `.claude/agents/pharn-review-lens.md` from SKILLS_VERSION
 * 6.64.0 on, but CLIs before this one never installed the surface. An install
 * already at the current version therefore lacks it, and its records do not
 * name it, so `findMissingInstalled` (which reads the records) cannot see the
 * gap: `status --strict` reported the file missing while plain `update` said
 * "Already up to date". This closes that disagreement without the network.
 *
 * True only when the install is at or above 6.64.0 (`compareVersionCore` — an
 * unorderable version never counts) AND no `pharn-*.md` (not `pharn-dev-*`)
 * entry of ANY type exists in `.claude/agents/`, whose path holds no symlinked
 * component and whose directory is absent or a real directory. That is what
 * keeps the re-open BOUNDED: the opened run restores the file (`missing →
 * restore`), so the next run early-returns; and nothing the run could not write
 * counts — a symlinked or non-directory `.claude/agents`, or a non-file at an
 * agent's path (the user's edit, or a type collision), is not missing. An
 * edited agent is not missing either.
 *
 * Residual (documented): a pharn-oss at or above 6.64.0 that stops shipping
 * any agent makes every run re-download and re-plan, changing nothing.
 *
 * Fail-safe: any fs or containment error is "not provably missing".
 */
export function agentSurfaceMissing(
  cwd: string,
  skillsVersion: string,
): boolean {
  const order = compareVersionCore(skillsVersion, AGENTS_FROM_SKILLS_VERSION);
  if (order === null || order < 0) return false;
  try {
    if (findSymlinkComponent(cwd, CLAUDE_AGENTS_DIR) !== null) return false;
    const dir = safeJoin(cwd, CLAUDE_AGENTS_DIR);
    const stat = lstatSync(dir, { throwIfNoEntry: false });
    if (stat === undefined) return true;
    if (!stat.isDirectory()) return false;
    return !readdirSync(dir).some(isProductAgentFile);
  } catch {
    return false;
  }
}
