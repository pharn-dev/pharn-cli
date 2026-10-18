import { existsSync, rmSync } from 'node:fs';
import { capabilitySubtree, type LayoutPaths } from './layout.js';
import { findSymlinkComponentOr } from './symlink-guard.js';
import { safeChildJoin, safeJoin } from './validate.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Addressing and deleting ONE capability directory — the one axis (P3) shared by
// the two commands that delete one: `pharn remove` (the user asks) and
// `pharn update` (it drops the capability from the config, so its directory must
// go too: PHARN's commands find capabilities by scanning these directories, not
// by reading `pharn.config.json`). One copy, so the two can never disagree about
// which directory a capability lives in or how it may be deleted.
//
// The role → subtree mapping itself is layout.ts's (`capabilitySubtree`); every
// reader and writer goes through it.
// ---------------------------------------------------------------------------

/** `<subtree>/<name>`, project-relative and posix — the record-key prefix too. */
export function capabilityRelDir(
  paths: LayoutPaths,
  capability: InstalledCapability,
): string {
  return `${capabilitySubtree(paths, capability.role)}/${capability.name}`;
}

/**
 * The absolute directory a capability addresses — a STRICT child of its role
 * subtree (`safeChildJoin`: never the subtree itself, never deeper), or a
 * `Refusing path` throw. Names are validated at config ingest already; this is
 * the second, independent floor under a recursive delete.
 */
export function capabilityDir(
  cwd: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): string {
  return safeChildJoin(
    safeJoin(cwd, capabilitySubtree(paths, capability.role)),
    capability.name,
  );
}

/**
 * The first symlinked component on the way to the capability directory (the
 * directory itself included), or null. `rmSync` resolves every ancestor, so with
 * `pharn -> ../shared` a delete of `pharn/pharn-review/x` would delete
 * `../shared/pharn-review/x` — outside the project — and `safeJoin` cannot see
 * that (it is lexical). Callers own the refusal shape.
 *
 * A component below a REGULAR file (ENOTDIR) is not a link: no directory can
 * exist there, and the delete's own `existsSync` reads it as gone — so that is
 * `null`, not an error.
 */
export function linkedComponent(
  cwd: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): string | null {
  return findSymlinkComponentOr(cwd, capabilityRelDir(paths, capability), null);
}

/**
 * Delete the capability's directory, returning whether it existed. Siblings are
 * never touched. Callers check `linkedComponent` (and back up what they must)
 * BEFORE calling this.
 */
export function deleteCapabilityDir(
  cwd: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): boolean {
  const dir = capabilityDir(cwd, paths, capability);
  const existed = existsSync(dir);
  if (existed) rmSync(dir, { recursive: true, force: true });
  return existed;
}
