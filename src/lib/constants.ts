// PHARN OSS lives in a single repo with capability subtrees. The CLI downloads
// it as a codeload tarball at a pinned SHA (lib/repo.ts), then copies the
// resolved capabilities + the fixed product surfaces into the user's project
// (lib/install-capabilities.ts).
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

export const FIRST_FEATURE_COMMAND = '/pharn-spec';

// ---------------------------------------------------------------------------
// The ROOT paths of the legacy flat layout (removed in v0.21.0). No command
// installs there any more; lib/install-surfaces.ts still recognises them as
// paths an older install wrote, so such a record stays an orphan `status`
// names and `uninstall` can remove by its hash.
// ---------------------------------------------------------------------------

// Griller capabilities (role: griller) → source subtree.
export const GRILLERS_DIR = 'pharn-pipeline/grillers';
// Lens capabilities (role: lens) → source subtree.
export const LENSES_DIR = 'pharn-review';
// Root version file pharn-oss ships.
export const SKILLS_VERSION_FILE = 'SKILLS_VERSION';
// OPTIONAL root file declaring the MINIMUM pharn CLI its content requires
// (lib/min-cli-gate.ts). Absent or malformed means "no constraint" (malformed
// also warns); only a well-formed newer value refuses.
export const MIN_CLI_FILE = 'MIN_CLI';
// Upstream's Apache-2.0 LICENSE and where an install puts it. Source and dest
// DIFFER on purpose: the user's root `LICENSE` is theirs.
export const UPSTREAM_LICENSE = 'LICENSE';
export const FLAT_LICENSE_DEST = 'PHARN-LICENSE';
export const PHARN_LICENSE_DEST = 'pharn/LICENSE';
// The flat layout's trusted docs, at the root. Also what keeps a pharn-layout
// install's OLD root THREAT-MODEL.md / LIMITS.md records (a pre-7.0 clone's)
// readable as orphans.
export const TRUSTED_DOCS = [
  'CONSTITUTION.md',
  'ARCHITECTURE.md',
  'THREAT-MODEL.md',
  'LIMITS.md',
];
// Inter-layer schema contracts (whole dir).
export const CONTRACTS_DIR = 'pharn-contracts';
// pharn-core: the mechanism layer the product commands cite by path. A FIXED
// surface copied whole, NOT a capability (its `role: skill` is outside
// ROLE_VALUES). Upstream never shipped a root `pharn-core/`.
export const CORE_DIR = 'pharn-core';
// Floor checkers the product commands + hooks invoke (the flat layout's path).
export const FLOOR_DIR = '.dev/floor';

// ---------------------------------------------------------------------------
// The pharn/ single-install layout: every runtime-read surface under pharn/,
// the one layout a fetched clone may have (lib/layout.ts).
// ---------------------------------------------------------------------------
export const PHARN_GRILLERS_DIR = 'pharn/pharn-pipeline/grillers';
export const PHARN_LENSES_DIR = 'pharn/pharn-review';
export const PHARN_CONTRACTS_DIR = 'pharn/pharn-contracts';
// The pharn-core surface upstream actually ships (see CORE_DIR above).
export const PHARN_CORE_DIR = 'pharn/pharn-core';
export const PHARN_FLOOR_DIR = 'pharn/floor';
// The same FOUR documents, all under pharn/ from pharn-oss SKILLS 7.0.0 on. A
// doc the manifest does not declare is not installed, and is named by
// `absentInstallSurfaces`, so a missing doc never reads as success.
export const PHARN_TRUSTED_DOCS = [
  'pharn/CONSTITUTION.md',
  'pharn/ARCHITECTURE.md',
  'pharn/THREAT-MODEL.md',
  'pharn/LIMITS.md',
];
// The product-loop boundary contract the product commands cite by name;
// layout-specific. NOT a trusted doc.
export const FEATURES_README = 'features/README.md';
export const PHARN_FEATURES_README = 'pharn/features/README.md';
// Claude Code surfaces.
export const CLAUDE_COMMANDS_DIR = '.claude/commands';
export const CLAUDE_HOOKS_DIR = '.claude/hooks';
// Subagent definitions: from SKILLS 6.64.0 `/pharn-review` runs each lens as
// `pharn-review-lens`. Same name rule as the commands. OPTIONAL — an older
// clone ships none, so it is never reported as not shipped.
export const CLAUDE_AGENTS_DIR = '.claude/agents';
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';
// Product commands (and agents) are `pharn-*.md`; `pharn-dev-*.md` are excluded.
export const PRODUCT_COMMAND_PREFIX = 'pharn-';
export const DEV_COMMAND_PREFIX = 'pharn-dev-';
