import { existsSync } from 'node:fs';
import { safeJoin } from './install-modules.js';
import {
  CONTRACTS_DIR,
  FLOOR_DIR,
  GRILLERS_DIR,
  LENSES_DIR,
  PHARN_CONTRACTS_DIR,
  PHARN_FLOOR_DIR,
  PHARN_GRILLERS_DIR,
  PHARN_LENSES_DIR,
  PHARN_TRUSTED_DOCS,
  TRUSTED_DOCS,
} from './constants.js';
import type { Layout, PharnConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Layout resolver — the ONE place that knows the two install layouts pharn-oss
// ships: the legacy `flat` layout (surfaces at the repo root) and the new `pharn`
// single-install layout (everything under pharn/, pharn-oss PR #86). The CLI
// MIRRORS whichever the fetched clone has — it never rewrites copied file
// contents — so a layout's source-relative-to-clone path IS its
// dest-relative-to-project path. Only the `.claude/*` command/hook/settings
// surfaces are layout-invariant (identical in both) and live in constants.ts.
//
// P5 (determinism): every layout decision here is a membership test whose else
// branch is the safe legacy default `flat` — never a guess, never an LLM.
// P7: `flat` IS the current behavior, so old pinned SHAs keep mirroring flat.
// ---------------------------------------------------------------------------

export interface LayoutPaths {
  layout: Layout;
  // Griller capability subtree (role: griller).
  grillers: string;
  // Lens capability subtree (role: lens).
  lenses: string;
  // Inter-layer schema contracts dir (whole dir).
  contracts: string;
  // Deterministic floor checkers dir (test files excluded on copy).
  floor: string;
  // Trusted spec docs copied verbatim (write-protected post-install by the
  // installed protect-trusted-paths hook). The pharn set drops THREAT-MODEL/LIMITS.
  docs: string[];
}

// Detect the layout of a fetched clone (or any dir) by a SPECIFIC marker the flat
// layout provably lacks: `pharn/pharn-contracts`. A bare `pharn/` dir is NOT the
// marker — it could exist for unrelated reasons — so detection keys on a leaf that
// only the relocated layout has (P5: a precise membership test). No `pharn/`
// contracts dir → `flat`, the safe legacy default.
export function detectLayout(rootDir: string): Layout {
  return existsSync(safeJoin(rootDir, PHARN_CONTRACTS_DIR)) ? 'pharn' : 'flat';
}

// The resolved path set for a layout — the same relative paths are used as the
// clone source AND the project destination (the mirror). Pure; no I/O.
export function layoutPaths(layout: Layout): LayoutPaths {
  if (layout === 'pharn') {
    return {
      layout,
      grillers: PHARN_GRILLERS_DIR,
      lenses: PHARN_LENSES_DIR,
      contracts: PHARN_CONTRACTS_DIR,
      floor: PHARN_FLOOR_DIR,
      docs: PHARN_TRUSTED_DOCS,
    };
  }
  return {
    layout,
    grillers: GRILLERS_DIR,
    lenses: LENSES_DIR,
    contracts: CONTRACTS_DIR,
    floor: FLOOR_DIR,
    docs: TRUSTED_DOCS,
  };
}

// The layout an installed project was recorded with. Enum-safe membership (P5):
// exactly `'pharn'` → pharn; anything else (including a legacy config that omits
// the field, or a hand-edited garbage value) → `flat`, the safe legacy default.
export function configLayout(config: PharnConfig): Layout {
  return config.layout === 'pharn' ? 'pharn' : 'flat';
}
