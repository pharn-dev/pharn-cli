import { lstatSync, readdirSync } from 'node:fs';
import { AGENTS_FROM_SKILLS_VERSION, CLAUDE_AGENTS_DIR } from './constants.js';
import { isProductAgentFile } from './install-manifest.js';
import { compareVersionCore } from './semver.js';
import { findSymlinkComponent } from './symlink-guard.js';
import { safeJoin } from './validate.js';

/**
 * Is an install at `skillsVersion` PROVABLY missing its `.claude/agents/`
 * agent definition? Local and read-only; re-opens `pharn update`'s
 * same-version early return. pharn-oss ships an agent from 6.64.0, and an
 * install an older CLI made has neither the file nor a record of it, so
 * `findMissingInstalled` cannot see the gap that `status --strict` reports.
 *
 * True only at or above 6.64.0 (an unorderable version never counts) AND when
 * no `pharn-*.md` (not `pharn-dev-*`) entry of ANY type is in a
 * `.claude/agents/` that is absent or a real directory with no symlinked
 * component. That keeps the re-open BOUNDED: the opened run restores the file,
 * and nothing the run could not write counts as missing.
 *
 * Residual: a pharn-oss ≥ 6.64.0 that stops shipping any agent makes every run
 * re-download and re-plan, changing nothing. Any fs error → not missing.
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
