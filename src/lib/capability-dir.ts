import { existsSync, rmSync } from 'node:fs';
import { capabilitySubtree, type LayoutPaths } from './layout.js';
import { findSymlinkComponentOr } from './symlink-guard.js';
import {
  ManifestValidationError,
  safeChildJoin,
  safeJoin,
} from './validate.js';
import type { InstalledCapability } from '../types.js';

// ---------------------------------------------------------------------------
// Addressing and deleting ONE capability directory, shared by every command
// that deletes one (`remove`, and `update`/`init` for a dropped capability —
// PHARN's commands find capabilities by scanning these directories, so a
// dropped one must go). One copy, so they never disagree.
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
 * subtree, or a `Refusing path` throw: a second floor (after ingest
 * validation) under a recursive delete.
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
 * The first symlinked component on the way to the capability directory (itself
 * included), or null: `rmSync` resolves ancestors, so a linked `pharn/` would
 * delete outside the project. ENOTDIR reads as `null` (no directory can be
 * there). Callers own the refusal shape.
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
 * never touched. Callers plan with `linkedComponent` (and back up what they
 * must) BEFORE calling this; the walk is repeated here, at the delete, because
 * a prompt may have sat between the plan and now and a component swapped for
 * a link would take `rmSync` outside the project. Throws
 * ManifestValidationError naming the link. Not atomic with `rmSync` (no
 * userland walk can be).
 */
export function deleteCapabilityDir(
  cwd: string,
  paths: LayoutPaths,
  capability: InstalledCapability,
): boolean {
  const linked = linkedComponent(cwd, paths, capability);
  if (linked !== null) {
    throw new ManifestValidationError(
      `${linked} is a symbolic link; refusing to delete through it. Nothing under it was deleted.`,
    );
  }
  const dir = capabilityDir(cwd, paths, capability);
  const existed = existsSync(dir);
  if (existed) rmSync(dir, { recursive: true, force: true });
  return existed;
}
