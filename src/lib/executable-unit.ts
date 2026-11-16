import { CLAUDE_COMMANDS_DIR, CLAUDE_HOOKS_DIR } from './constants.js';
import {
  isInstalledHookFile,
  isProductCommandFile,
} from './install-manifest.js';
import type { LayoutPaths } from './layout.js';

// ---------------------------------------------------------------------------
// The executable unit — the install files that run TOGETHER, so `pharn update`
// writes them all or none (lib/update-decision.ts → the hold pass). The floor
// CLIs import each other and read the floor's data maps, the hooks import
// floor modules, and the commands call floor CLIs by flag: upgrading one while
// an edited sibling is skipped leaves two versions mixed (observed: a floor CLI
// died at load importing an export an old, edited sibling lacked).
//
// Membership is by PATH ONLY — nothing is read or parsed:
//   - every file the install copies under the layout's floor dir, its `.json`
//     maps included;
//   - every installed hook (`.claude/hooks/*.cjs|*.mjs`, not tests);
//   - every product command (`.claude/commands/pharn-*.md`, not `pharn-dev-*`).
// Everything else is read by the model, not executed, and upgrades per file.
// ---------------------------------------------------------------------------

/** Is this manifest rel a member of the executable unit? Pure. */
export function isExecutableUnitPath(rel: string, paths: LayoutPaths): boolean {
  // The trailing slash is load-bearing: `pharn/floorplan/x.mjs` is not inside
  // `pharn/floor`.
  if (rel.startsWith(`${paths.floor}/`)) return true;
  const hooksPrefix = `${CLAUDE_HOOKS_DIR}/`;
  if (rel.startsWith(hooksPrefix))
    return isInstalledHookFile(rel.slice(hooksPrefix.length));
  const commandsPrefix = `${CLAUDE_COMMANDS_DIR}/`;
  if (rel.startsWith(commandsPrefix))
    return isProductCommandFile(rel.slice(commandsPrefix.length));
  return false;
}
