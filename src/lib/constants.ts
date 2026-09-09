// PHARN OSS lives in a single repo with capability subtrees (pharn-pipeline/
// grillers, pharn-review, …). The CLI degit-clones the whole repo at a pinned
// SHA, then copies the resolved capabilities + the fixed product surfaces into
// the user's project (lib/install-capabilities.ts).
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

export const FIRST_FEATURE_COMMAND = '/pharn-spec';

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
// OPTIONAL root file pharn-oss may ship declaring the MINIMUM pharn CLI version
// its content requires — the forward-compatibility handshake (lib/min-cli-gate.ts).
// Upstream ships none today, so its absence is the normal case and means "no
// constraint"; a malformed one means the same, plus a warning. Only a well-formed
// value NEWER than the installed CLI ever refuses.
export const MIN_CLI_FILE = 'MIN_CLI';
// Trusted spec docs copied to the project root (write-protected there by the
// installed protect-trusted-paths.cjs hook).
// Upstream's Apache-2.0 LICENSE at the clone ROOT, and where an install puts it.
// Source and dest DIFFER on purpose: the user's own root `LICENSE` is theirs, and
// an identity-mapped copy would overwrite it (see LayoutPaths.license).
export const UPSTREAM_LICENSE = 'LICENSE';
export const FLAT_LICENSE_DEST = 'PHARN-LICENSE';
export const PHARN_LICENSE_DEST = 'pharn/LICENSE';
export const TRUSTED_DOCS = [
  'CONSTITUTION.md',
  'ARCHITECTURE.md',
  'THREAT-MODEL.md',
  'LIMITS.md',
];
// Inter-layer schema contracts (whole dir).
export const CONTRACTS_DIR = 'pharn-contracts';
// pharn-core (ARCHITECTURE.md §4, L0–L2): the agnostic mechanism layer — today
// the seam-resolver skill + its evals, which the copied product commands cite by
// path. A FIXED product surface (copied whole, like pharn-contracts), NOT a
// capability: its frontmatter says `role: skill`, deliberately outside the CLI's
// ROLE_VALUES, and it is never resolved through the capability index.
//
// P7, honest scope: this FLAT path is resolved for LayoutPaths uniformity only —
// pharn-oss has no root `pharn-core/` (the dir postdates the pharn/ relocation),
// so on every flat clone the copy and the manifest see existsSync false and
// no-op. It is a no-op path, not support for a layout upstream ships.
export const CORE_DIR = 'pharn-core';
// Deterministic floor checkers the product commands + hooks invoke at runtime.
// Copied whole EXCEPT test files (see install-capabilities.ts). NOT `.dev/`
// wholesale — `.dev/features` and `.dev/memory-bank` are dev-only and excluded.
export const FLOOR_DIR = '.dev/floor';
// Test apparatus INSIDE the floor dir: fixture skills (including a deliberately
// RED one) plus structural expected/actual pairs, read ONLY by the `*.test.mjs`
// files the install already excludes. Dev-only, so excluded from a product
// install — otherwise a user browsing their installed floor finds a deliberately
// malformed capability and red failure fixtures, and reasonably concludes the
// install is broken. Matched as a floor-RELATIVE path SEGMENT on both the copy
// and the mirror side, so `my-test-fixtures.mjs` is unaffected.
export const FLOOR_TEST_FIXTURES_DIR = 'test-fixtures';

// ---------------------------------------------------------------------------
// The new pharn/ single-install layout (pharn-oss PR #86 / pharn-runtime-layout):
// every runtime-read surface relocates under pharn/ so the dev repo and the
// installed project share ONE tree. The CLI mirrors whichever layout the fetched
// clone actually has (lib/layout.ts → detectLayout); these are the pharn/
// counterparts of the flat constants above. `.claude/*` command/hook/settings
// paths are identical in both layouts.
// ---------------------------------------------------------------------------
export const PHARN_GRILLERS_DIR = 'pharn/pharn-pipeline/grillers';
export const PHARN_LENSES_DIR = 'pharn/pharn-review';
export const PHARN_CONTRACTS_DIR = 'pharn/pharn-contracts';
// The pharn-core surface upstream actually ships (see CORE_DIR above).
export const PHARN_CORE_DIR = 'pharn/pharn-core';
export const PHARN_FLOOR_DIR = 'pharn/floor';
// The same FOUR documents as the flat set, but the prefix is per-DOC, not per-
// layout: pharn-oss's relocation moved CONSTITUTION.md and ARCHITECTURE.md under
// pharn/ and left THREAT-MODEL.md and LIMITS.md at the repo ROOT. The mirror
// (lib/layout.ts) makes a clone-relative path the project-relative one, so these
// entries are where upstream actually keeps each doc — not a uniform prefix.
//
// Measured against pharn-oss@main, not assumed. Of the files ONE install copies,
// 108 cite these docs, and the spelling tracks the real location per doc:
// `THREAT-MODEL.md` bare 118×, `pharn/`-prefixed 0×; `LIMITS.md` bare 68×,
// prefixed 0×; while the two relocated docs are cited `pharn/ARCHITECTURE.md`
// 239× and `pharn/CONSTITUTION.md` 54×. None is a markdown link — they are
// backticked prose paths, the form an agent resolves against the PROJECT ROOT.
// Upstream's own protect-trusted-paths.cjs (a hook THIS install copies) agrees:
// its DEFAULT_PROTECTED names `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`,
// `THREAT-MODEL.md`, `LIMITS.md`.
//
// Before this, the last two entries read `pharn/THREAT-MODEL.md` / `pharn/LIMITS.md`
// — paths that have NEVER existed upstream (the GitHub commits API returns an
// empty history for both). Both readers are existence-guarded, so the two docs
// were silently dropped from every install and those 108 files shipped citing
// nothing. The guards stay: a clone that lacks a doc still installs cleanly and
// simply does not get it (P7) — but steps/install-archetype.ts now REPORTS which
// docs landed, so an existence-guarded no-op can no longer read as success.
export const PHARN_TRUSTED_DOCS = [
  'pharn/CONSTITUTION.md',
  'pharn/ARCHITECTURE.md',
  'THREAT-MODEL.md',
  'LIMITS.md',
];
// Claude Code surfaces.
// The product-loop boundary contract: upstream's root features/README.md, cited
// BY NAME from 7 of the 10 installed product commands (`pharn-spec`, `-plan`,
// `-grill`, `-build`, `-regress`, `-verify`, `-ship`). All seven are installed;
// before this, the file they cite was not, so every one of those pointers landed
// on nothing in the user's project.
//
// Layout-invariant: upstream keeps `features/` at the repo ROOT in both layouts —
// verified against a live pharn-layout checkout — exactly like the `.claude/*`
// surfaces below. NOT a trusted doc: it is absent from the installed
// protect-trusted-paths hook's DEFAULT_PROTECTED, and rightly so, since it
// describes a directory the user's own agent writes into.
//
// Failure mode if upstream ever relocates it under `pharn/`: both readers are
// existence-guarded, so it is QUIETLY NOT INSTALLED — no error, no warning.
export const FEATURES_README = 'features/README.md';
export const CLAUDE_COMMANDS_DIR = '.claude/commands';
export const CLAUDE_HOOKS_DIR = '.claude/hooks';
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';
// Product commands are `pharn-*.md`; the dev-loop commands `pharn-dev-*.md` are
// excluded from a product install.
export const PRODUCT_COMMAND_PREFIX = 'pharn-';
export const DEV_COMMAND_PREFIX = 'pharn-dev-';
