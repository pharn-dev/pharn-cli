import { CLAUDE_COMMANDS_DIR, CLAUDE_HOOKS_DIR } from './constants.js';
import {
  isInstalledHookFile,
  isProductCommandFile,
} from './install-manifest.js';
import type { LayoutPaths } from './layout.js';

// ---------------------------------------------------------------------------
// The executable unit — the install files that run TOGETHER, so `pharn update`
// writes them all or none (lib/update-decision.ts → the hold pass).
//
// Why a unit: the floor CLIs import each other and read the floor's own data
// maps, the hooks import floor modules, and the product commands call floor CLIs
// by name and flag. Upgrading one file of that set while an edited sibling is
// skipped leaves a mix of two versions. Measured on CLI 0.16.2 (skills 4.0.0 →
// 7.3.1): a new `worktree-fingerprint.mjs` was written beside an old, edited
// `reconcile-baseline.mjs` that lacked an export it imports, and every floor CLI
// importing it died at load.
//
// Membership is by PATH ONLY (P5): no file is read and no import is parsed, so
// the answer is a prefix/name test over the manifest rel. The coupling the
// members share is the advisory reason for the list, never something inferred
// from their contents. Members:
//
//   - every file the install copies under the layout's floor dir
//     (`pharn/floor/` or, flat, `.dev/floor/`): its `.mjs` CLIs and modules AND
//     the `.json` maps they read, so a new CLI never runs over an old map;
//   - every installed hook (`.claude/hooks/*.cjs|*.mjs`, not tests);
//   - every product command (`.claude/commands/pharn-*.md`, not `pharn-dev-*`),
//     because a command and the floor CLI it calls must agree on its flags.
//
// Everything else (capability dirs, trusted docs, contracts, pharn-core, the
// license, the features README) still upgrades file by file: those are read by
// the model, not executed.
// ---------------------------------------------------------------------------

/**
 * Is this manifest rel (a posix path relative to the project root) a member of
 * the executable unit at these layout paths? Pure: no I/O.
 */
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
