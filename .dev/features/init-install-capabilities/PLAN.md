# PLAN — init-install-capabilities (archetype-driven `pharn init` install, flag-gated)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — sha256 of ARCHITECTURE.md, read this run
- increment: Wire the existing pure **detect** (`detect-archetype.ts`) + **resolve** (`resolve-capabilities.ts`) into a **working, flag-gated** `pharn init --archetype`: fetch pharn-oss, derive a validated capability index from capability frontmatter, resolve against detected archetypes, show selected/skipped + confirm, copy the product surfaces (excluding dev-only), and write `pharn.config.json`.
- layer(s): **product** (`pharn` CLI, `src/`) — the installer, not a `pharn-*` methodology Capability.
- constitution_refs: [P0, P1, P2, P3, P5, P6, P7]

## Decisions carried in (human-selected at this plan's HALT, this run)

1. **Scope = the full working command** (human picked "Full working command" over the smaller "index-boundary only" / "read-only preview" slices). This increment is **deliberately larger than P7's default "smallest coherent increment"** — the human authorized that at the plan gate. Consequence: a broad diff; the grill stage should scrutinize the copy/exclusion invariants and the untrusted-frontmatter parse boundary hardest.
2. **Legacy init = keep both, flag-gated** (human picked "Keep both, flag-gated"). The manifest-based `runInit` (v1/v2 module wizard) — **dead against live pharn-oss**, see grounding — stays the **default**; the new archetype flow runs only under `pharn init --archetype`. No legacy file is retired this increment (P7 — old pins never break; nothing removed).

## Grounding established this run (P6 — live reads, not memory; supersedes stale prior grounding)

- **Live pharn-oss (`pharn-dev/pharn-oss@main`, GitHub tree read this run) ships NO `manifest.json` / `module.json` / index file** — only a root `SKILLS_VERSION`. So the legacy `fetchRemoteManifest`/`runInit` path cannot work against real upstream today (motivates the flag, decision #2).
- **Applicability IS machine-readable** — each capability's frontmatter carries an `applies:` field. Verified live: `a11y` → `["ssr","spa"]`, `security` → `["universal"]`, `n-plus-one` → `["backend","ssr"]`, `path-traversal` → `["backend","ssr"]`, `trust-fence`/`injection`/`architecture` → `["universal"]`. **This reverses the `capability-resolver` plan's grounding** ("no machine-readable applicability"), which is now stale — hence no separate upstream index increment is needed; the index is **derived from frontmatter** at the fetch boundary (this increment).
- **Product surface (copy targets), confirmed live:** grillers `pharn-pipeline/grillers/<dir>/` (13); lenses `pharn-review/<dir>/` (22); product commands `.claude/commands/pharn-*.md` — **9 live** (`pharn-build`, `pharn-grill`, `pharn-loop`, `pharn-plan`, `pharn-regress`, `pharn-review`, `pharn-ship`, `pharn-spec`, `pharn-verify`) — the brief said "7"; **live is 9** (noted, using live); hooks `.claude/hooks/*.cjs` (3: `protect-trusted-paths`, `enforce-writes-scope`, `set-writes-scope`, each with a `.test.cjs`); `.claude/settings.json`; trusted docs at root (`CONSTITUTION.md`, `ARCHITECTURE.md`, `THREAT-MODEL.md`, `LIMITS.md`); `pharn-contracts/*.md` (3); `.dev/floor/` (40 non-test `.mjs` + support `.json` + 41 `.test.mjs`).
- **Product commands invoke `.dev/floor/*.mjs` by project-root-relative path** (verified: `pharn-verify.md` → `validate.mjs`, `check-verify.mjs`, `check-build-complete.mjs`, `check-plan-spec-agree.mjs`, `check-structural.mjs`, `count-verifiers.mjs`; `pharn-build.md` → `validate.mjs`, `check-plan-spec-agree.mjs`). `.claude/settings.json` wires `protect-trusted-paths.cjs` + `enforce-writes-scope.cjs` as PreToolUse hooks. This **fixes the dest layout** (see Open questions #1) — it is forced by the commands' own path references, not a free choice.
- **Dev-only to exclude:** `pharn-dev-*.md` commands, `.dev/features/`, `.dev/memory-bank/`, and all `.test.*` (hook/floor tests).
- **Naming:** griller dir `a11y` ↔ frontmatter `name: a11y-griller` (suffix differs); lens dir `n-plus-one` ↔ `name: n-plus-one`. The **install/copy key is the DIR basename** (deterministic copy target); `role` (griller|lens) selects the source subtree.
- **Test harness (live):** `tests/*.test.ts` build fake fetched-repos on disk (`write()`/`scaffold*()` + `useTmpDir`), no network. The archetype install's copy + parse are tested this way; the network `fetchRepo()` is reused as-is (not re-tested).

## Files

**New (product logic + UI):**

- `src/lib/capability-index.ts` — **NEW** — the **untrusted-frontmatter → typed `CapabilityIndex`** fetch boundary (the piece `resolve-capabilities.ts` explicitly defers). Given a fetched repo dir: enumerate `pharn-pipeline/grillers/*/` + `pharn-review/*/` (sorted → deterministic), read each `<dir>/<dir>.md`, extract **only** `name`/`role`/`applies` via a **strict field reader** (NOT a general YAML parser — P2), validate (`role ∈ {griller,lens}`, each `applies` token ∈ `{universal,ssr,backend,spa,lib}`, `["universal"]` → `'universal'`, `universal` mixed with archetypes → hard-fail), key each entry by dir basename, guard every read with `safeJoin`. Malformed/unknown → **hard-fail naming the offending capability** (P5), never silent-skip. One axis: *deriving the typed index from fetched frontmatter*. Layer product.
- `src/lib/install-capabilities.ts` — **NEW** — the copy routine: `(repoDir, projectRoot, Selection) → InstalledCapability[]`. Copies each **selected** griller/lens dir (by role → source subtree) + the **fixed** product surfaces (the 9 `pharn-*` commands, 3 hook `.cjs`, `settings.json`, 4 trusted docs, `pharn-contracts/`, `.dev/floor/` non-test) to **mirrored** project-root paths. **Excludes** dev-only (`pharn-dev-*`, `.dev/features/`, `.dev/memory-bank/`, `.test.*`). Every source name from the fetched tree is regex-validated + `..`-checked; every read/write is `safeJoin`-guarded (P2). Pre-flight asserts each selected source exists before any write (no partial installs, mirrors `assertSkillSourcesExist`). One axis: *the capability copy routine*. Layer product.
- `src/steps/archetype-summary.ts` — **NEW** — clack UI: show detected archetypes + selected/skipped capabilities (with reasons), return `'install' | 'cancel'`. Mirrors `steps/summary.ts`. One axis: *the archetype summary + confirm stage*. Layer product.
- `src/steps/install-archetype.ts` — **NEW** — the apply stage: overwrite-guard `pharn.config.json`, call `installCapabilities`, read + validate `SKILLS_VERSION` from the repo, `fetchCommitSha()`, assemble + `writePharnConfig`, outro. Mirrors `steps/install.ts`. Takes the already-fetched `repoDir` (network-free → testable). One axis: *the archetype apply/config stage*. Layer product.

**Edits (additive; existing axes unchanged):**

- `src/commands/init.ts` — **EDIT** — add `runInitArchetype()` and dispatch on the flag; legacy `runInit` unchanged as default. `runInitArchetype`: `showBanner` → `intro` → `runGitPrereq` (git is the **only** hard prereq — the flow is archetype-agnostic, so it does **not** require `next`) → `runFreshCheck` → `detectArchetypesFromProject(cwd)` (+ note) → `fetchRepo()` → `parseCapabilityIndex` → `resolveCapabilities` → `runArchetypeSummary` → on install `runInstallArchetype(repo.dir, cwd, archetypes, selection)` → `repo.cleanup()` in `finally`. `runInit` gains `opts?: { archetype?: boolean }`. Axis (owns the `init` verb) unchanged — P3.
- `src/index.ts` — **EDIT** — add `archetype` to the minimist `boolean` list; `case 'init'` → `runInit({ archetype: Boolean(argv.archetype) })`; add a one-line `--archetype` entry to USAGE (P4 — it's implemented, so documenting is required, not speculative).
- `src/lib/validate.ts` — **EDIT (additive)** — add `CAPABILITY_NAME_RE` (dir basenames, e.g. `a11y`, `copy-paste-drift`), and the `ROLE_VALUES` / `ARCHETYPE_VALUES` enum allowlists + a small `assertArchetype`/`assertRole` helper for the index parse. Keeps all security allowlists in one file (P2/P3). Axis (the validation allowlist home) unchanged.
- `src/lib/constants.ts` — **EDIT (additive)** — path constants: `GRILLERS_DIR = 'pharn-pipeline/grillers'`, `LENSES_DIR = 'pharn-review'`, `SKILLS_VERSION_FILE = 'SKILLS_VERSION'`, `TRUSTED_DOCS`, `CONTRACTS_DIR`, `FLOOR_DIR`, product-command prefix + dev-command exclusion. Axis (repo path constants) unchanged.
- `src/types.ts` — **EDIT (additive)** — add `InstalledCapability { name: string; role: 'griller' | 'lens' }`; extend `PharnConfig` with `archetypes?: Archetype[]` and `capabilities?: InstalledCapability[]`; **relax `constitution` to optional** (`constitution?: Constitution`) — verified additive against read sites at build (legacy configs that include it stay valid — P7). Axis (shared type vocabulary) unchanged.

**Tests (P1 — every new behavior + security invariant; details under `## Evals to write`):**

- `tests/capability-index.test.ts` — **NEW**
- `tests/install-capabilities.test.ts` — **NEW**
- `tests/init-archetype.test.ts` — **NEW**
- `tests/archetype-summary.test.ts` — **NEW**
- `tests/pharn-config.test.ts` — **EDIT**
- `tests/validate.test.ts` — **EDIT**
- `tests/index.test.ts` — **EDIT**

**Nothing removed.** `commands/init.ts` legacy paths, `installer.ts`, `install-modules.ts`, `vendor-fetch.ts`, `manifest.ts`, all `steps/*` for the wizard flow are left **byte-unchanged** (P7).

## Contracts satisfied

- **`ARCHITECTURE.md §5`** (archetype + capability applicability) — realizes archetype→capability selection **at install time**, the consumer of the detected-archetype membership test. Cited, not restated (P4).
- **`ARCHITECTURE.md §3.1`** (Capability frontmatter) — the index parser reads `name`/`role`/`applies` from the frontmatter. Cited (P4). **NOTE (human-owned reconciliation, surfaced not edited):** §3.1's listed frontmatter fields do **not** include `applies` (live capabilities carry it), and §5 phrases detection as "membership over `package.json`" (detection also walks the file tree). Trusted docs are hook-protected / human-only — the agent will not edit them (P2).
- **`ARCHITECTURE.md §2`** (the floor) — the parse boundary reduces to enum/regex membership + path-containment; the copy reduces to a fixed source set + `safeJoin`. Cited (P4).
- **`THREAT-MODEL.md §2` surface B** (PHARN itself ingesting hostile context) — the frontmatter parse + copy is exactly this boundary; taint is contained by validation + `safeJoin` (see Trust audit). Cited (P4).

## Evals to write (P1 — for product TS, the vitest suite IS the eval/spec)

- `tests/capability-index.test.ts` — **NEW**:
  - fake repo (grillers/lenses w/ frontmatter) → typed index keyed by dir; `applies: ["universal"]` → `'universal'`; archetype array preserved.
  - `role` not in `{griller,lens}` → hard-fail naming the capability (P5).
  - unknown `applies` token (e.g. `["mobile"]`) → hard-fail (P2 enum).
  - `universal` mixed with archetypes (`["universal","ssr"]`) → hard-fail (P5).
  - capability dir/name with `..` or path-escaping chars → rejected (`CAPABILITY_NAME_RE` + `safeJoin`).
  - missing frontmatter / missing `applies` → hard-fail naming the file.
  - deterministic order across repeated parses (sorted enumeration).
- `tests/install-capabilities.test.ts` — **NEW**:
  - copies **selected** grillers/lenses only; an unselected sibling is **not** copied.
  - product `pharn-*.md` commands copied; **`pharn-dev-*.md` NOT copied**; `.dev/features/` + `.dev/memory-bank/` **NOT copied**; `.test.*` **NOT copied**.
  - hooks/settings/docs/contracts/floor land at **mirrored** project-root paths.
  - a malicious source name (`../escape`) is rejected before any write (`safeJoin`); a missing selected source fails pre-flight with nothing written.
- `tests/init-archetype.test.ts` — **NEW (the brief's headline fixture e2e)** — fixture project `package.json {dependencies:{next}}` + fake repo → `detectArchetypesFromProject` = `[ssr]` → parse+resolve → `installCapabilities` + `runInstallArchetype(repoDir, …)`: assert **a backend-only lens is skipped**, ssr/universal capabilities installed, `pharn-dev-*` excluded, product commands present, and `pharn.config.json` has `archetypes:['ssr']` + `capabilities[]` (network-free: exercises the apply path with a local `repoDir`, not `fetchRepo`).
- `tests/archetype-summary.test.ts` — **NEW** (P1 completion, GRILL.md finding F3) — mock `@clack/prompts`; assert `runArchetypeSummary` renders detected archetypes + selected/skipped capabilities and returns `install`/`cancel` (mirrors `tests/summary.test.ts`).
- `tests/pharn-config.test.ts` — **EDIT** — a **legacy** config (has `constitution` + `modules`, no `archetypes`) still `readPharnConfig`s (P7); an **archetype** config (`archetypes` + `capabilities` + `modules:[]`, no `constitution`) reads + round-trips.
- `tests/validate.test.ts` — **EDIT** — `CAPABILITY_NAME_RE` accept/reject; `assertArchetype`/`assertRole` enum membership + control-char/`..` rejection.
- `tests/index.test.ts` — **EDIT** — `pharn init --archetype` dispatches to the archetype flow (spy on `runInit`, assert it receives `{archetype:true}`); bare `init` keeps `{archetype:false}` (legacy default).

## Guarantee audit (P0)

- **"Detection deterministic (same project → same archetypes)"** → **floor:** pure membership + vitest (existing `detect-archetype`/`archetype` suites; reused).
- **"Selection deterministic"** → **floor:** pure set-intersection + vitest (existing `resolve-capabilities` suite; reused).
- **"The capability index is parsed safely from untrusted frontmatter"** → **floor:** enum/regex allowlists (`validate.ts`) + `safeJoin` on every read + **hard-fail on malformed** (P5) + vitest. A **strict field reader**, not a general YAML parser, touches the untrusted bytes.
- **"Only selected capabilities + product (non-dev) surfaces are copied; dev-only excluded"** → **floor:** a **fixed** source set + regex-validated names + a **deterministic exclusion filter** (`pharn-dev-*` prefix / `.test.*` suffix / `.dev/features` + `.dev/memory-bank` never in the copy set) + `safeJoin` on every write + a vitest that asserts the exclusions.
- **"Same project + same upstream commit → same install"** → **floor:** sorted enumeration + fixed source set + membership resolve + vitest.
- **"Network fetch is guarded"** → **floor (inherited, not newly claimed):** reuses `repo.ts` `fetchRepo` (degit) + `fetchCommitSha` (`redirect:'error'` + 8s timeout). The degit clone's properties are the existing ones — reused, not re-guaranteed here.
- **"The installed methodology/capabilities are CORRECT or safe to RUN"** → **advisory — NOT claimed.** Correctness/safety of pharn-oss's capability *content* + its `applies` values is pharn-oss's SoT + provenance (`LIMITS.md`, `THREAT-MODEL.md §5`). The CLI guarantees only the **validated parse** + the **path-contained deterministic copy** — never that the copied content is good. Copied files are **data to the CLI** (never executed/parsed by it; the user's Claude Code runs them later — the same trust posture as the legacy module install).

No guarantee is asserted without a floor reduction; the one thing that could masquerade as a guarantee — "the methodology is safe" — is explicitly labeled advisory.

## Trust audit (P2)

Untrusted input ingested this increment: the **fetched pharn-oss repo** — capability frontmatter, file **names**, and file **contents**.

- **Capability / file NAMES** (dir + file basenames from the fetched tree) → validated against `CAPABILITY_NAME_RE` (+ `..` + control-char check) **before** any path-join, then `safeJoin`-guarded → cannot escape the project root. A validated name may be **persisted** into `pharn.config.json` `capabilities[]` because it is now a floor-verified (enum/regex) field, not free text.
- **`role` / `applies` frontmatter values** → validated against enum allowlists; malformed → **hard-fail** (never silently trusted). `applies` drives `resolve` (a membership test over a validated enum) — **no free-text frontmatter value ever drives a branch** (P5).
- **File CONTENTS** (command `.md`, hook `.cjs`, floor `.mjs`, docs, contracts) → **copied verbatim, never executed or parsed** by the CLI. The CLI's guarantee is a **path-contained copy** (`safeJoin`), not content safety — identical to the existing installer's posture (`P2`: fetched files are untrusted data; every copy `safeJoin`-guarded). Taint does not reach any CLI control-flow decision.
- **`SKILLS_VERSION`** → read + validated (`VERSION_RE`) before persisting.
- **No untrusted value is interpolated into degit/shell** here — the clone source is the hardcoded `REPO` constant, not user/fetched input.

## Open questions (HALT)

Resolved-with-stated-default below (the two shape-determining forks were already answered at the interactive gate); these are refinements — confirm at approval, or accept the stated defaults:

1. **Dest layout = mirror pharn-oss's relative paths into the user's PROJECT ROOT** (`.claude/{commands,hooks,settings.json}`; root docs at root; `pharn-contracts/`, `.dev/floor/`, `pharn-pipeline/grillers/`, `pharn-review/` at their same paths). **This is forced by the product commands' own project-root-relative path references** (grounding) — treated as determined, not a free choice. Confirm.
2. **`.dev/floor/` copy scope = all non-`.test.mjs` files + support `.json`** (not just the subset a given command names) — floor `.mjs` import each other, so a referenced-only subset risks a missing transitive import. Default: copy all non-test floor files.
3. **Selected griller/lens dirs are copied whole, including their `evals/`** — the `evals/` are the capability's committed spec and match "copy `pharn-pipeline/grillers/<matched>`". Default: include `evals/`.
4. **`constitution` field** — the archetype flow installs pharn-oss's canonical `CONSTITUTION.md` verbatim (no variant selection), so the config **omits** `constitution`; the type field becomes optional (additive). Build will verify no read site dereferences it unconditionally; if one does, fall back to writing the nominal `'standard'`.
