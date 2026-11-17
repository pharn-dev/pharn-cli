import { existsSync } from 'node:fs';
import { ManifestValidationError, safeJoin } from './validate.js';
import {
  PHARN_CONTRACTS_DIR,
  PHARN_CORE_DIR,
  PHARN_FLOOR_DIR,
  PHARN_GRILLERS_DIR,
  PHARN_LENSES_DIR,
  PHARN_LICENSE_DEST,
  PHARN_FEATURES_README,
  PHARN_TRUSTED_DOCS,
  UPSTREAM_LICENSE,
} from './constants.js';
import type { InstalledCapability, Layout } from '../types.js';

// ---------------------------------------------------------------------------
// Layout resolver — the ONE place that knows the install layout: `pharn`
// (everything under pharn/). A fetched clone is `pharn` (its
// pharn-install.json declares it), and a source path IS its dest path —
// except `license` (see the field). The `.claude/*` surfaces live in
// constants.ts.
//
// The legacy `flat` layout (surfaces at the repo root) was removed in v0.21.0
// (docs/contributing.md#support-policy): a flat clone is refused here, and a
// config recorded at it is refused by `loadArchetypeConfig` with "re-run
// `pharn init`".
// ---------------------------------------------------------------------------

export interface LayoutPaths {
  layout: Layout;
  // Griller capability subtree (role: griller).
  grillers: string;
  // Lens capability subtree (role: lens).
  lenses: string;
  // Inter-layer schema contracts dir (whole dir).
  contracts: string;
  // pharn-core dir (whole dir): a fixed surface, not a capability.
  core: string;
  // Deterministic floor checkers dir (test files excluded on copy).
  floor: string;
  // Upstream's Apache-2.0 LICENSE (§4(a): redistributors pass it on), the ONE
  // source≠dest mapping: an identity-mapped root `LICENSE` would overwrite the
  // user's own. The dest is pharn's: `pharn/LICENSE`.
  license: { from: string; to: string };
  // Trusted spec docs copied verbatim (write-protected by the installed hook),
  // at their pharn/ path. A doc the manifest does not declare is not
  // installed, and is named by absentInstallSurfaces.
  docs: string[];
  featuresReadme: string;
}

/** Does the tree at `rootDir` carry the pharn layout's marker? */
export function isPharnLayout(rootDir: string): boolean {
  return existsSync(safeJoin(rootDir, PHARN_CONTRACTS_DIR));
}

/**
 * A clone's layout: `pharn`, by its marker `pharn/pharn-contracts` (a bare
 * `pharn/` could exist for unrelated reasons). A tree without it is the flat
 * layout of a pharn-oss from before `pharn/`, which this CLI no longer
 * installs: refused before anything is written.
 */
export function detectLayout(rootDir: string): Layout {
  if (isPharnLayout(rootDir)) return 'pharn';
  throw new ManifestValidationError(
    `The fetched pharn-oss has no ${PHARN_CONTRACTS_DIR}: it ships the flat layout (PHARN's files at the project root), which pharn no longer installs (removed in v0.21.0). Re-run on the latest release (the default, \`--ref latest\`) or with \`--ref main\`. Nothing was written.`,
  );
}

// The resolved path set for a layout (source = dest, except `license`). Pure.
export function layoutPaths(layout: Layout): LayoutPaths {
  return {
    layout,
    grillers: PHARN_GRILLERS_DIR,
    lenses: PHARN_LENSES_DIR,
    contracts: PHARN_CONTRACTS_DIR,
    core: PHARN_CORE_DIR,
    floor: PHARN_FLOOR_DIR,
    docs: PHARN_TRUSTED_DOCS,
    featuresReadme: PHARN_FEATURES_README,
    license: { from: UPSTREAM_LICENSE, to: PHARN_LICENSE_DEST },
  };
}

/**
 * The subtree holding a capability of `role` at this layout — the ONE role →
 * directory mapping every reader and writer goes through.
 */
export function capabilitySubtree(
  paths: LayoutPaths,
  role: InstalledCapability['role'],
): string {
  return role === 'griller' ? paths.grillers : paths.lenses;
}
