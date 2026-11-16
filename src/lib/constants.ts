// PHARN OSS lives in a single repo with capability subtrees. The CLI downloads
// it as a codeload tarball at a pinned SHA (lib/repo.ts), then copies the
// resolved capabilities + the fixed product surfaces into the user's project
// (lib/install-capabilities.ts).
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

export const FIRST_FEATURE_COMMAND = '/pharn-spec';

// ---------------------------------------------------------------------------
// Repo-relative source paths in the fetched clone (the FLAT layout). The
// install mirrors them into the project root so the copied product commands'
// project-root-relative references resolve after install.
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
// The FLAT layout's trusted docs, at the root. Also what keeps a pharn-layout
// install's OLD root THREAT-MODEL.md / LIMITS.md records readable (orphan
// detection's install-root set uses both layouts' lists).
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
// ROLE_VALUES). Upstream ships no root `pharn-core/`, so this flat path is a
// no-op kept for LayoutPaths uniformity.
export const CORE_DIR = 'pharn-core';
// Floor checkers the product commands + hooks invoke. Copied whole EXCEPT test
// files and FLOOR_TEST_FIXTURES_DIRS; never `.dev/` wholesale.
export const FLOOR_DIR = '.dev/floor';
// Test apparatus inside the floor, read only by `*.test.mjs` — excluded so an
// installed floor holds no deliberately-RED fixtures and status/update do not
// track test data. A floor-relative segment anchored at the floor root
// (`isFloorTestFixturePath`), so a nested `lib/fixtures/` is kept. Add a name
// only after checking upstream that no non-test floor file, hook or command
// reads it.
export const FLOOR_TEST_FIXTURES_DIRS: readonly string[] = [
  'test-fixtures',
  'fixtures',
];

// ---------------------------------------------------------------------------
// The pharn/ single-install layout: every runtime-read surface under pharn/.
// The CLI mirrors whichever layout the clone has (lib/layout.ts); `.claude/*`
// paths are identical in both.
// ---------------------------------------------------------------------------
export const PHARN_GRILLERS_DIR = 'pharn/pharn-pipeline/grillers';
export const PHARN_LENSES_DIR = 'pharn/pharn-review';
export const PHARN_CONTRACTS_DIR = 'pharn/pharn-contracts';
// The pharn-core surface upstream actually ships (see CORE_DIR above).
export const PHARN_CORE_DIR = 'pharn/pharn-core';
export const PHARN_FLOOR_DIR = 'pharn/floor';
// The same FOUR documents, all under pharn/ from pharn-oss SKILLS 7.0.0 on. A
// pre-7.0 clone still ships THREAT-MODEL/LIMITS at the root: see
// PHARN_ROOT_FALLBACK_DOCS. A doc a clone lacks is not installed, and is named
// by `absentInstallSurfaces`, so an existence-guarded no-op never reads as
// success.
export const PHARN_TRUSTED_DOCS = [
  'pharn/CONSTITUTION.md',
  'pharn/ARCHITECTURE.md',
  'pharn/THREAT-MODEL.md',
  'pharn/LIMITS.md',
];
// The probe fallback (resolveTrustedDocs): each pharn-layout doc a pre-7.0
// clone still ships at the ROOT. Removable once no supported pharn-oss is older
// than 7.0.0. Also the fixed list the root-doc migration may delete from.
export const PHARN_ROOT_FALLBACK_DOCS: Readonly<Record<string, string>> = {
  'pharn/THREAT-MODEL.md': 'THREAT-MODEL.md',
  'pharn/LIMITS.md': 'LIMITS.md',
};
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
