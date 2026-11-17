import { existsSync } from 'node:fs';
import pc from './color.js';
import { safeJoin } from './validate.js';
import {
  CONTRACTS_DIR,
  CORE_DIR,
  FLAT_LICENSE_DEST,
  FLOOR_DIR,
  GRILLERS_DIR,
  LENSES_DIR,
  PHARN_CONTRACTS_DIR,
  PHARN_CORE_DIR,
  PHARN_FLOOR_DIR,
  PHARN_GRILLERS_DIR,
  PHARN_LENSES_DIR,
  PHARN_LICENSE_DEST,
  FEATURES_README,
  PHARN_FEATURES_README,
  PHARN_ROOT_FALLBACK_DOCS,
  PHARN_TRUSTED_DOCS,
  TRUSTED_DOCS,
  UPSTREAM_LICENSE,
} from './constants.js';
import type { InstalledCapability, Layout, PharnConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Layout resolver — the ONE place that knows the two install layouts: legacy
// `flat` (surfaces at the repo root) and `pharn` (everything under pharn/). The
// CLI MIRRORS whichever the clone has, so a source path IS its dest path —
// except `license` (see the field). The `.claude/*` surfaces are identical in
// both and live in constants.ts. Every decision's else branch is the safe
// legacy default `flat`.
//
// The `flat` layout is deprecated in v0.20.0 and removed in v0.22.0
// (docs/contributing.md#support-policy): its branches here, the `Layout`
// member and `flatDeprecationLines` go then.
// ---------------------------------------------------------------------------

export interface LayoutPaths {
  layout: Layout;
  // Griller capability subtree (role: griller).
  grillers: string;
  // Lens capability subtree (role: lens).
  lenses: string;
  // Inter-layer schema contracts dir (whole dir).
  contracts: string;
  // pharn-core dir (whole dir): a fixed surface, not a capability. The flat
  // clone has none upstream, so its consumers find nothing there.
  core: string;
  // Deterministic floor checkers dir (test files excluded on copy).
  floor: string;
  // Upstream's Apache-2.0 LICENSE (§4(a): redistributors pass it on), the ONE
  // source≠dest mapping: an identity-mapped root `LICENSE` would overwrite the
  // user's own. The dest is pharn's: `pharn/LICENSE` or flat `PHARN-LICENSE`.
  license: { from: string; to: string };
  // Trusted spec docs copied verbatim (write-protected by the installed hook),
  // at the layout's own path — where a CLONE keeps each is resolveTrustedDocs's
  // answer. Every consumer existence-guards each entry.
  docs: string[];
  featuresReadme: string;
}

// Detect a clone's layout by a marker the flat layout lacks:
// `pharn/pharn-contracts` (a bare `pharn/` could exist for unrelated reasons).
export function detectLayout(rootDir: string): Layout {
  return existsSync(safeJoin(rootDir, PHARN_CONTRACTS_DIR)) ? 'pharn' : 'flat';
}

// The resolved path set for a layout (source = dest, except `license`). Pure.
export function layoutPaths(layout: Layout): LayoutPaths {
  if (layout === 'pharn') {
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
  return {
    layout,
    grillers: GRILLERS_DIR,
    lenses: LENSES_DIR,
    contracts: CONTRACTS_DIR,
    core: CORE_DIR,
    floor: FLOOR_DIR,
    docs: TRUSTED_DOCS,
    featuresReadme: FEATURES_README,
    license: { from: UPSTREAM_LICENSE, to: FLAT_LICENSE_DEST },
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

// The layout an installed project was recorded with: exactly `'pharn'` →
// pharn; anything else (absent, garbage) → `flat`.
export function configLayout(config: PharnConfig): Layout {
  return config.layout === 'pharn' ? 'pharn' : 'flat';
}

// The DEPRECATED note `pharn status` and `pharn update` print for an install
// recorded at the `flat` layout (null for any other), text output only, so
// the `--json` reports keep their schemaVersion-1 bytes. Advisory, never a
// `--strict` input. The move is `update`'s layout migration, which mirrors
// the clone, and every current pharn-oss ships the `pharn` layout. Removed in
// v0.22.0, with the flat layout.
export function flatDeprecationLines(layout: Layout): string[] | null {
  if (layout !== 'flat') return null;
  return [
    'This install is at the flat layout (PHARN files at the project',
    'root). The flat layout is deprecated and is removed in pharn v0.22.0.',
    pc.dim('`pharn update` moves the install to the pharn/ layout; then'),
    pc.dim('delete the old top-level copies it leaves behind by hand.'),
  ];
}

// Where the clone carries the product-loop boundary contract. For the pharn
// layout an ordered existence probe also accepts an older clone's root path.
export function resolveFeaturesReadme(repoDir: string, layout: Layout): string {
  if (layout === 'pharn') {
    const preferred = safeJoin(repoDir, PHARN_FEATURES_README);
    if (!existsSync(preferred)) {
      return FEATURES_README;
    }
  }
  return layoutPaths(layout).featuresReadme;
}

// Where the clone carries each trusted doc: for the pharn layout, its pharn/
// path when present, else the root path a pre-7.0 clone ships
// (PHARN_ROOT_FALLBACK_DOCS). Existence only; flat has no fallback.
export function resolveTrustedDocs(repoDir: string, layout: Layout): string[] {
  const docs = layoutPaths(layout).docs;
  if (layout !== 'pharn') return docs;
  return docs.map((doc) => {
    const fallback = PHARN_ROOT_FALLBACK_DOCS[doc];
    if (fallback === undefined) return doc;
    return existsSync(safeJoin(repoDir, doc)) ? doc : fallback;
  });
}
