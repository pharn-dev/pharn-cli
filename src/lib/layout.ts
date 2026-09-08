import { existsSync } from 'node:fs';
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
  PHARN_TRUSTED_DOCS,
  TRUSTED_DOCS,
  UPSTREAM_LICENSE,
} from './constants.js';
import type { Layout, PharnConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Layout resolver — the ONE place that knows the two install layouts pharn-oss
// ships: the legacy `flat` layout (surfaces at the repo root) and the new `pharn`
// single-install layout (everything under pharn/, pharn-oss PR #86). The CLI
// MIRRORS whichever the fetched clone has — it never rewrites copied file
// contents — so a layout's source-relative-to-clone path IS its
// dest-relative-to-project path, with ONE deliberate exception: `license`, whose
// dest differs from its source (see the field). Only the `.claude/*`
// command/hook/settings surfaces are layout-invariant (identical in both) and
// live in constants.ts.
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
  // pharn-core dir (whole dir): the agnostic mechanism layer the copied product
  // commands cite — today the seam-resolver skill + its evals. A fixed surface,
  // not a capability. Resolved in BOTH layouts for uniformity; the flat clone has
  // no such dir upstream, so its consumers simply find nothing there (P7).
  core: string;
  // Deterministic floor checkers dir (test files excluded on copy).
  floor: string;
  // Upstream's Apache-2.0 LICENSE, the ONE deliberate source≠dest mapping in the
  // CLI. Apache-2.0 §4(a) requires giving recipients a copy of the license when
  // redistributing, and a user who commits and publishes a pharn-initialized
  // repo is redistributing ~450 Apache-2.0 files.
  //
  // Why it cannot be an ordinary identity-mapped doc: those are copied
  // `{ force: true }` at the SAME relative path, so a root `LICENSE` entry would
  // overwrite the USER's own root LICENSE on every flat install — silent,
  // unprompted data loss in a file people care about. The destination is
  // therefore unmistakably pharn's: `pharn/LICENSE` beside the other pharn docs,
  // or `PHARN-LICENSE` at the root in the legacy flat layout.
  license: { from: string; to: string };
  // Trusted spec docs copied verbatim (write-protected post-install by the
  // installed protect-trusted-paths hook). The SAME four documents in both
  // layouts — only their prefix differs. Every consumer existence-guards each
  // entry, so a clone missing one contributes nothing rather than failing (P7).
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
// clone source AND the project destination (the mirror), EXCEPT `license`, which
// carries its source and dest separately. Pure; no I/O.
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
    license: { from: UPSTREAM_LICENSE, to: FLAT_LICENSE_DEST },
  };
}

// The layout an installed project was recorded with. Enum-safe membership (P5):
// exactly `'pharn'` → pharn; anything else (including a legacy config that omits
// the field, or a hand-edited garbage value) → `flat`, the safe legacy default.
export function configLayout(config: PharnConfig): Layout {
  return config.layout === 'pharn' ? 'pharn' : 'flat';
}
