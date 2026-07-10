// PHARN OSS lives in a single repo with capability subtrees (pharn-pipeline/
// grillers, pharn-review, …). The CLI degit-clones the whole repo at a pinned
// SHA, then copies the resolved capabilities + the fixed product surfaces into
// the user's project (lib/install-capabilities.ts).
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

export const FIRST_FEATURE_COMMAND = '/pharn-plan';

// ---------------------------------------------------------------------------
// Archetype (capability) install (pharn init --archetype). Repo-relative source
// paths in the fetched pharn-oss clone. Each capability lives at
// `<subtree>/<name>/<name>.md`; the install mirrors these paths (and the .claude
// surfaces) into the user's project root so the copied product commands' own
// project-root-relative references (`.dev/floor/...`, `pharn-contracts/...`,
// `pharn-pipeline/grillers/...`) resolve after install (ARCHITECTURE.md §5/§6).
// ---------------------------------------------------------------------------

// Griller capabilities (role: griller) → source subtree.
export const GRILLERS_DIR = 'pharn-pipeline/grillers';
// Lens capabilities (role: lens) → source subtree.
export const LENSES_DIR = 'pharn-review';
// Root version file pharn-oss ships instead of a manifest (the archetype flow
// reads this in place of manifest.skillsVersion).
export const SKILLS_VERSION_FILE = 'SKILLS_VERSION';
// Trusted spec docs copied to the project root (write-protected there by the
// installed protect-trusted-paths.cjs hook).
export const TRUSTED_DOCS = [
  'CONSTITUTION.md',
  'ARCHITECTURE.md',
  'THREAT-MODEL.md',
  'LIMITS.md',
];
// Inter-layer schema contracts (whole dir).
export const CONTRACTS_DIR = 'pharn-contracts';
// Deterministic floor checkers the product commands + hooks invoke at runtime.
// Copied whole EXCEPT test files (see install-capabilities.ts). NOT `.dev/`
// wholesale — `.dev/features` and `.dev/memory-bank` are dev-only and excluded.
export const FLOOR_DIR = '.dev/floor';

// ---------------------------------------------------------------------------
// The new pharn/ single-install layout (pharn-oss PR #86 / pharn-runtime-layout):
// every runtime-read surface relocates under pharn/ so the dev repo and the
// installed project share ONE tree. The CLI mirrors whichever layout the fetched
// clone actually has (lib/layout.ts → detectLayout); these are the pharn/
// counterparts of the flat constants above. `.claude/*` command/hook/settings
// paths are identical in both layouts. THREAT-MODEL.md / LIMITS.md are NOT under
// pharn/ (they stay dev-only), so the pharn docs set is CONSTITUTION + ARCHITECTURE
// only — the flat set's THREAT-MODEL/LIMITS are dropped from a pharn install.
// ---------------------------------------------------------------------------
export const PHARN_GRILLERS_DIR = 'pharn/pharn-pipeline/grillers';
export const PHARN_LENSES_DIR = 'pharn/pharn-review';
export const PHARN_CONTRACTS_DIR = 'pharn/pharn-contracts';
export const PHARN_FLOOR_DIR = 'pharn/floor';
export const PHARN_TRUSTED_DOCS = [
  'pharn/CONSTITUTION.md',
  'pharn/ARCHITECTURE.md',
];
// Claude Code surfaces.
export const CLAUDE_COMMANDS_DIR = '.claude/commands';
export const CLAUDE_HOOKS_DIR = '.claude/hooks';
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';
// Product commands are `pharn-*.md`; the dev-loop commands `pharn-dev-*.md` are
// excluded from a product install.
export const PRODUCT_COMMAND_PREFIX = 'pharn-';
export const DEV_COMMAND_PREFIX = 'pharn-dev-';
