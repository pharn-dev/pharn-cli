# PLAN — commands-off-manifest (retire the dead manifest/module subsystem)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Migrate `add`/`list`/`remove`/`status`/`update` fully onto the archetype/capability model + `pharn/` layout, then delete the now-orphaned manifest/module/wizard install path — closing Fable's symlink finding (`install-modules.ts`).
- layer(s): pharn (the installer) — `src/commands/*`, `src/lib/*`, `src/steps/*`, `tests/*`, docs
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Context (live state, verified this run)

All five commands ALREADY branch on `isArchetypeConfig(config)` (= `Array.isArray(config.capabilities)`,
`lib/pharn-config.ts:133`) and take a **manifest-free archetype path** — `runArchetypeAdd`,
`runArchetypeUpdate`, `runArchetypeStatus`, `buildArchetypeInventory`, `removeCapability`. The manifest
survives ONLY in each command's **legacy `else` branch**, which is **already non-functional against live
pharn-oss** (no `manifest.json` upstream → 404; the code itself says so at `pharn-config.ts:131` and
`list.ts:65`). `init` was migrated in #32 and no longer has a legacy path.

The migration is therefore: **excise the dead legacy branch + the lib files only it uses.**

Import graph (verified by grep this run):
- `safeJoin` lives in `install-modules.ts` (to be deleted) but is imported by SIX keepers:
  `install-capabilities.ts`, `diff.ts`, `layout.ts`, `skills-version.ts`, `capability-index.ts`,
  `remove.ts` (its **archetype** path). → `safeJoin` must relocate first.
- `manifest.ts` importers: `diff.ts` (legacy `diffInstalled` only), `installer.ts`, `install-modules.ts`,
  and the 5 commands' legacy branches.
- `installer.ts` (`fetchAndInstall`) importers: `add.ts`, `update.ts` legacy branches only.
- `wizard.ts` (`findSkillOption`/`listSkillAddresses`) importers: `add.ts`, `list.ts`, `update.ts` legacy only.
- `assertPrerequisites` (`steps/prereqs.ts`) importer: `add.ts` legacy only (`runGitPrereq` stays — `init`).

Once the legacy branches leave, `manifest.ts` / `installer.ts` / `wizard.ts` / `install-modules.ts` have
zero importers and delete cleanly.

## Files

**Relocate `safeJoin` (unblocks the deletion) — decision Q2:**

- `src/lib/validate.ts` — MOVE `safeJoin` here (it already owns `ManifestValidationError` + the
  path/`..`/regex floor; this is the security-validation axis). layer: lib
- `src/lib/install-capabilities.ts` — `safeJoin` import: `./install-modules.js` → `./validate.js`. layer: lib
- `src/lib/diff.ts` — `safeJoin` import → `./validate.js`; **remove `diffInstalled`** (legacy module diff)
  + its `readModuleManifest` import; keep `diffInstalledCapabilities`. layer: lib
- `src/lib/layout.ts` — `safeJoin` import → `./validate.js`. layer: lib
- `src/lib/skills-version.ts` — `safeJoin` import → `./validate.js`. layer: lib
- `src/lib/capability-index.ts` — `safeJoin` import → `./validate.js`. layer: lib

**Excise the legacy branch from each command (archetype-only; a non-archetype config → clear hard-fail
message, decision Q1). Single-source the reject via a shared helper (grill F4/P3):**

- `src/lib/pharn-config.ts` — ADD `loadArchetypeConfigOrExit(cwd)`: `loadConfigOrExit` + require
  `isArchetypeConfig`, else print the named "legacy module layout no longer supported — re-run
  `pharn init`" message + `exit(1)`. add/update/status/remove call it (no 5× copy). `list` keeps its own
  json-aware inline check (its error must go to stderr in `--json`). layer: lib
- `src/index.ts` — sync the `USAGE`/help text off the module model (grill F3/P4): `add <capability>` /
  `remove <capability>` / `list`/`update` describe capabilities, not "methodology module / stack pack /
  installed modules". layer: entry
- `src/commands/add.ts` — drop `loadManifest`/`addSkill`/module flow + manifest/wizard/installer/
  `assertPrerequisites` imports; keep `runArchetypeAdd`; non-archetype config → named message + `exit(1)`. layer: commands
- `src/commands/update.ts` — drop legacy `runUpdate` body + manifest/wizard/installer imports; keep
  `runArchetypeUpdate`; non-archetype → message. layer: commands
- `src/commands/list.ts` — drop `buildInventory`/`renderHuman`/`loadManifest` + manifest/wizard imports;
  keep archetype render + `--json`; non-archetype → message (json-aware, to stderr). layer: commands
- `src/commands/status.ts` — drop legacy version/drift branch + `readManifest`/`resolveModules`/
  `fetchRemoteManifest` imports; keep `runArchetypeStatus`; non-archetype → message. layer: commands
- `src/commands/remove.ts` — drop `removeSkill`/`removeModule`/`runPicker`/`planAndApplyModuleRemoval`
  + all module helpers + manifest imports; keep `removeCapability` (+ its no-arg picker over installed
  capabilities); `safeJoin` import → `./validate.js`; non-archetype → message. layer: commands

**Trim the orphans left behind:**

- `src/steps/prereqs.ts` — remove `assertPrerequisites` + its `ManifestModule`/`ModulePrerequisite` type
  imports; keep `runGitPrereq`. layer: steps
- `src/lib/constants.ts` — remove now-unused `MANIFEST_RAW_PATH`, `CORE_MODULE`, `SKILL_MODULE_PREFIX`. layer: lib
- `src/types.ts` — remove now-unreferenced manifest/wizard schema types (`Manifest`, `ManifestModule`,
  `ModuleManifest`, `ModulePrerequisite`, `WizardCondition/Option/Rule/Question/Section/Spec`,
  `WizardConfig`). KEEP `PharnConfig`'s additive legacy fields (`constitution`, `installedSkills`,
  `stackAnswers`) + their referenced types (`Constitution`, `InstalledSkill`, `InstalledModule`) so a
  legacy config still LOADS (P7 additive). layer: lib

**Tests (P1) — modify:**

- `tests/validate.test.ts` — ADD `safeJoin`'s path-escape/`..`/containment cases, moved from install-modules.test.ts (a security invariant keeps a test). layer: tests
- `tests/add.test.ts` — drop manifest mock + legacy cases; keep archetype; add "legacy config → message + exit(1) + fetch NOT called" (grill F6). layer: tests
- `tests/update.test.ts` — drop manifest mock + legacy cases; keep archetype; add legacy-config→message+no-fetch case. layer: tests
- `tests/list.test.ts` — drop manifest mock + legacy cases; keep archetype `--json`; add legacy-config→message case (json-aware). layer: tests
- `tests/status.test.ts` — drop manifest mock + legacy cases; keep archetype; add legacy-config→message+no-fetch case. layer: tests
- `tests/remove.test.ts` — drop legacy module/skill cases; keep capability cases; add legacy-config→message case. layer: tests
- `tests/index.test.ts` — update any assertion on the module-worded `USAGE`/dispatch text (grill F3). layer: tests
- `tests/diff.test.ts` — drop `diffInstalled` (legacy) cases; keep `diffInstalledCapabilities`. layer: tests
- `tests/prereqs.test.ts` — drop `assertPrerequisites` cases; keep `runGitPrereq`. layer: tests
- `tests/pharn-config.test.ts` — ADD `loadArchetypeConfigOrExit` unit tests (archetype config returns; legacy/non-archetype → `LEGACY_CONFIG_MESSAGE` via log.error + exit(1)) — the message's home, since command tests mock pharn-config (grill F4/F6 follow-through). layer: tests

**Docs (P4) — sync to the capability model (scope of doc sync = decision Q3):**

- `CLAUDE.md` — rewrite the "Module model" / "Manifest schemaVersion 1 vs 2" / per-command legacy paragraphs to the archetype/capability model only; note the module/manifest subsystem was removed. layer: docs
- `docs/commands/add.md` — sync to capabilities. layer: docs
- `docs/commands/list.md` — sync to capabilities. layer: docs
- `docs/commands/remove.md` — sync to capabilities. layer: docs
- `docs/commands/status.md` — sync to capabilities. layer: docs
- `docs/commands/update.md` — sync to capabilities. layer: docs
- `docs/commands/init.md` — remove any residual module-model reference. layer: docs
- `docs/reference/pharn-config.md` — describe the archetype config; drop module/schemaVersion prose. layer: docs
- `docs/roadmap.md` — remove/relabel module-model references. layer: docs
- `docs/troubleshooting.md` — remove/relabel module-model references. layer: docs
- `docs/getting-started.md` — remove/relabel module-model references. layer: docs
- `docs/README.md` — remove/relabel module-model references. layer: docs
- `docs/contributing.md` — remove/relabel module-model references. layer: docs

### Explicitly deleted (via `rm`; NOT writes-scope-gated — the hook gates only Write/Edit)

- `src/lib/manifest.ts`, `src/lib/install-modules.ts`, `src/lib/installer.ts`, `src/lib/wizard.ts`
- `tests/manifest.test.ts`, `tests/manifest-v2.test.ts`, `tests/install-modules.test.ts`, `tests/install-skills.test.ts`, `tests/installer.test.ts`, `tests/wizard.test.ts`, `tests/wizard-fixture.ts`

## Contracts satisfied

- `THREAT-MODEL.md §3` (the floor map) — the surviving install path keeps `INSTALL_PATH_RE` +
  `safeJoin` + symlink rejection over every copy; the manifest/`module.json`/wizard **attack surfaces
  (§2 rows 1–3) are removed entirely**, a net reduction. # cite, do not restate (P4)
- `LIMITS.md §1a/§1b` — placement-not-content + provenance-not-crypto posture is unchanged (still degit,
  still SHA-pinned, still no per-file hash). `§1d` (`@main` resolution) narrows: only `status`/`update`
  archetype paths resolve live now.
- `CONSTITUTION.md` P2/P3/P5/P6 — preserved by construction (see audits below).

## Evals to write (P1) # pharn's evals ARE its vitest tests (P1: "tests are the spec")

- `safeJoin` (relocated) → path escaping `..`/absolute/outside-base → throws; in-base → returns joined path.
- `add` (archetype) → `add lens:n-plus-one` copies one capability + appends to config; already-installed → noop.
- `add`/`update`/`list`/`status`/`remove` (non-archetype config) → prints the named "legacy no longer
  supported — re-run `pharn init`" message and `exit(1)`; **never** performs a network fetch.
- `list --json` (archetype) → emits the `mode:"archetype"` inventory; no manifest fetch.
- `status` (archetype) → version via `SKILLS_VERSION` + `diffInstalledCapabilities`; `--strict` gate intact.
- `update` (archetype) → re-resolves recorded archetypes → re-copies capabilities; up-to-date → noop.
- `remove` (archetype) → deletes one capability dir + drops its config entry; no clone/network.
- Whole suite: `npm run check` (format + lint + typecheck + test) green with the 4 libs + 7 tests deleted.

## Guarantee audit (P0)

- "No command fetches `manifest.json` (no 404)" → floor: **grep/enum membership** — post-change
  `grep -rn "manifest" src/commands src/lib` returns nothing importing/fetching it, and `tsc` fails on any
  dangling import; a per-command test asserts the legacy path takes the message branch, not a fetch.
- "`install-modules.ts` + `manifest.ts` deleted, nothing imports them" → floor: **import-graph
  membership** (empty) + typecheck.
- "The symlink arbitrary-write finding is closed" → floor: **path-containment (`safeJoin`) + regex
  (`INSTALL_PATH_RE`/`CAPABILITY_NAME_RE`) + `isSymlink` rejection** — the ONLY surviving copy path is
  `install-capabilities.ts`, whose symlink guards + `safeJoin` are tested; `safeJoin`'s own escape tests
  move to `validate.test.ts`. The deleted `install-modules.ts` was the last non-capability copy path.
- "A legacy (non-archetype) config is handled deterministically" → floor: **membership test**
  `isArchetypeConfig` (`Array.isArray(capabilities)`); the else branch is a **named hard-fail message**,
  not a guess (P5) — tested per command.
- "tests green" → floor: the `check-verify` / `check-regress` deterministic gates (npm test exit 0). Not a
  self-asserted "quality" claim (P0).

No un-backstopped guarantee. The one honestly-labeled **advisory** item: the user-facing prose of the new
"legacy unsupported" message is advisory text; the **decision** to print it is the deterministic branch.

## Trust audit (P2)

- Ingested untrusted input: the degit-cloned pharn-oss tree (add/update/status clone it). Taint path is
  **unchanged and already floor-backed**: capability names read from the fetched index are validated
  (`CAPABILITY_NAME_RE` + `assertNoDotDot`) BEFORE any path-join, every copy/read is `safeJoin`-guarded,
  and symlinked sources are rejected (`install-capabilities.ts`). No free-text from the fetched repo drives
  a filesystem write.
- Net effect: removing the legacy path **deletes** three untrusted surfaces (`manifest.json` `installs`
  map, per-module `module.json`, the v2 `wizard` block — `THREAT-MODEL.md §2` rows 1–3). Trust posture
  strictly improves; nothing new is ingested.

## Determinism audit (P5)

- The only new branch is `isArchetypeConfig(config)` → archetype path, `else` → named message + `exit(1)`.
  Both arms are deterministic; the fallback is a **hard-fail with a clear message** (the P5-sanctioned
  terminal), never a guess or a silent proceed. Capability resolution stays name/role membership.

## Open questions (HALT) — RESOLVED at GATE 1 (human approved 2026-07-10)

1. **P7 legacy back-compat (the crux).** → **RESOLVED: hard-fail with a clear, named message.** A
   pre-archetype (module) `pharn.config.json` (no `capabilities`) → add/update/remove/list/status print
   "legacy module layout no longer supported — re-run `pharn init`" + `exit(1)`, never a fetch. The human
   accepted that `CONSTITUTION.md P7`'s *manifest clause* is superseded by the archetype model (the
   manifest is already 404 upstream). The trusted docs stay human-reconciled (see note below).
2. **`safeJoin`'s new home.** → **RESOLVED: `lib/validate.ts`** (co-locate with `ManifestValidationError`
   + the regex floor; its escape tests move to `tests/validate.test.ts`).
3. **Increment size / doc scope.** → **RESOLVED: one increment** = code + tests + `CLAUDE.md` + user
   `docs/` (ends fully P4-consistent).

## Grill incorporation (GRILL.md — advisory, folded in pre-build)

- **F3 (P4)** → added `src/index.ts` + `tests/index.test.ts` to Files (USAGE/help text sync).
- **F4 (P3/DRY)** → added `src/lib/pharn-config.ts` `loadArchetypeConfigOrExit` shared helper (list keeps
  its json-aware inline check).
- **F6 (P1)** → legacy-config tests assert the fetch/clone mock is uncalled.
- **F1 (P7), F2 (P4-trusted-docs)** → recorded; human-owned (GATE 1 acceptance + trusted-doc reconciliation).
- **F5 (P0), F7 (P7 orphans)** → build-time verification steps: grep surviving src for any stray
  `cpSync`/`writeFileSync` copy-from-clone (substantiate "sole copy path"); sweep for newly-dead exports
  (e.g. `format.ts` `shortDescription`). Not new files — checks during build.
- **F8 (P7 scope)** → advisory; build phases strictly (relocate+importers → command excision → deletions →
  tests → docs), running `npm run check` between phases.

## Doc reconciliation surfaced for the human (NOT agent-edited — trusted/hook-protected)

`CONSTITUTION.md` (P2 "the manifest.json, each module.json, the v2 wizard block"; P5 "schemaVersion is
matched exactly"; P7 "schemaVersion 1 legacy … forever"), `ARCHITECTURE.md §4/§5` (manifest layer),
`THREAT-MODEL.md §2` (manifest attack surface), `LIMITS.md §1b/§1d` all describe the module/manifest model
as current. After this increment they are partially stale. These four files are **human-only,
hook-protected** (`protect-trusted-paths.cjs`); the agent will not edit them. Flagged here for a human to
reconcile — the same "surface, never agent-edit" discipline `ARCHITECTURE.md` mandates.
