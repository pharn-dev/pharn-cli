// PHARN OSS lives in a single repo with capability subtrees (pharn-pipeline/
// grillers, pharn-review, …). The CLI downloads the whole repo as a codeload
// tarball at a pinned SHA and extracts it into a temp dir (lib/repo.ts,
// lib/tar-extract.ts), then copies the resolved capabilities + the fixed
// product surfaces into the user's project (lib/install-capabilities.ts).
export const REPO = 'pharn-dev/pharn-oss';
export const REPO_BRANCH = 'main';
export const REPO_URL = 'github.com/pharn-dev/pharn-oss';

export const FIRST_FEATURE_COMMAND = '/pharn-spec';

// ---------------------------------------------------------------------------
// Archetype (capability) install (`pharn init`). Repo-relative source
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
// The legacy FLAT layout's trusted docs, all at the project root. They stay
// here for flat installs, and they are also what keeps a pharn-layout install's
// OLD root THREAT-MODEL.md / LIMITS.md records readable: orphan detection's
// install-root set (lib/orphans.ts) is built from both layouts' lists.
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
// Test apparatus INSIDE the floor dir, read ONLY by the `*.test.mjs` files the
// install already excludes: `test-fixtures/` (fixture skills, including a
// deliberately RED one, plus structural expected/actual pairs) and `fixtures/`
// (pharn-oss's cost-ledger transcript JSONL). Dev-only, so excluded from a
// product install — otherwise a user browsing their installed floor finds a
// deliberately malformed capability and red failure fixtures, and reasonably
// concludes the install is broken, and `status`/`update` drift-track test data
// as product. Matched as a floor-RELATIVE path SEGMENT anchored at the floor
// root, on both the copy and the mirror side (`isFloorTestFixturePath` in
// install-manifest.ts is the one predicate), so `my-test-fixtures.mjs` and a
// NESTED `lib/fixtures/` are unaffected. Verified test-only upstream before
// each name was added: no non-test floor file, hook or command reads it.
export const FLOOR_TEST_FIXTURES_DIRS: readonly string[] = [
  'test-fixtures',
  'fixtures',
];

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
// The same FOUR documents as the flat set, all under pharn/ — where the pharn
// layout keeps them from pharn-oss SKILLS_VERSION 7.0.0 on. The mirror
// (lib/layout.ts) makes a clone-relative path the project-relative one.
//
// Root is NOT where two of them live for good. Up to 6.x, pharn-oss's relocation
// moved CONSTITUTION.md and ARCHITECTURE.md under pharn/ and left THREAT-MODEL.md
// and LIMITS.md at the repo root; 7.0.0 moves those two as well, so that an
// installed project's root holds only `.claude/`, `pharn/` and pharn's two JSON
// files. A clone from before that move still ships them at the root, which is
// what PHARN_ROOT_FALLBACK_DOCS below covers: an ordered probe
// (resolveTrustedDocs, lib/layout.ts), existence only, never a content read.
//
// (History: these two entries once read `pharn/…` while upstream still kept
// them at the root, and both readers' existence guards dropped
// them from every install in silence. The guards stay — a clone that lacks a
// doc still installs cleanly and simply does not get it (P7) — but the install
// REPORTS which docs landed and `absentInstallSurfaces` names a missing one, so
// an existence-guarded no-op cannot read as success.)
export const PHARN_TRUSTED_DOCS = [
  'pharn/CONSTITUTION.md',
  'pharn/ARCHITECTURE.md',
  'pharn/THREAT-MODEL.md',
  'pharn/LIMITS.md',
];
// The probe fallback: for each pharn-layout doc a pre-7.0 clone still ships at
// the ROOT, that root path. Kept only while a supported pharn-oss can be older
// than 7.0.0; once every clone ships both under pharn/, this map (and the
// fallback branch of resolveTrustedDocs) can go. It is also the fixed, two-entry
// list the root-doc migration (lib/root-migration.ts) may delete from.
export const PHARN_ROOT_FALLBACK_DOCS: Readonly<Record<string, string>> = {
  'pharn/THREAT-MODEL.md': 'THREAT-MODEL.md',
  'pharn/LIMITS.md': 'LIMITS.md',
};
// Claude Code surfaces.
// The product-loop boundary contract, cited BY NAME from 7 of the 10 installed
// product commands. Layout-specific since pharn-oss SKILLS_VERSION 5.0.0: the
// pharn layout keeps it at `pharn/features/README.md`; the legacy flat layout
// keeps the pre-5.0 root path. NOT a trusted doc.
export const FEATURES_README = 'features/README.md';
export const PHARN_FEATURES_README = 'pharn/features/README.md';
export const CLAUDE_COMMANDS_DIR = '.claude/commands';
export const CLAUDE_HOOKS_DIR = '.claude/hooks';
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';
// Product commands are `pharn-*.md`; the dev-loop commands `pharn-dev-*.md` are
// excluded from a product install.
export const PRODUCT_COMMAND_PREFIX = 'pharn-';
export const DEV_COMMAND_PREFIX = 'pharn-dev-';
