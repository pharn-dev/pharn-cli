// PHARN OSS lives in a single repo with module subfolders (pharn-core,
// pharn-pipeline, …). The CLI fetches the whole repo, then copies the
// selected modules' `installs` maps into the user's `.claude/`.
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

// raw.githubusercontent.com path to the authoritative version + dependency
// manifest. Used by `pharn update` to check the latest skillsVersion without
// cloning the whole repo.
export const MANIFEST_RAW_PATH = `${REPO}/${REPO_BRANCH}/manifest.json`;

export const FIRST_FEATURE_COMMAND = '/pharn-plan';

// pharn-core is always installed; it is the foundation every other module
// depends on.
export const CORE_MODULE = 'pharn-core';

// schemaVersion 2 skill-category modules follow the `pharn-skills-<category>`
// convention (e.g. `orm` → `pharn-skills-orm`). Every installable wizard option
// is rooted at one of these so `add <category>:<skill>` can address it.
export const SKILL_MODULE_PREFIX = 'pharn-skills-';

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
// Claude Code surfaces.
export const CLAUDE_COMMANDS_DIR = '.claude/commands';
export const CLAUDE_HOOKS_DIR = '.claude/hooks';
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';
// Product commands are `pharn-*.md`; the dev-loop commands `pharn-dev-*.md` are
// excluded from a product install.
export const PRODUCT_COMMAND_PREFIX = 'pharn-';
export const DEV_COMMAND_PREFIX = 'pharn-dev-';
