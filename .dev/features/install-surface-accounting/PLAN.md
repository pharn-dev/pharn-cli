# PLAN — install-surface-accounting: a declared product surface upstream does not ship is NAMED, never silently omitted

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # sha256 of ARCHITECTURE.md, computed this run
- increment: Make the install's fixed product surfaces an explicit, single-sourced accounting in `lib/install-manifest.ts` (per declared surface: shipped vs `absentUpstream`), report every absent surface in `init` and `update` (warn, not fatal) and in `status` (a DRIFT partition that fails `--strict`, plus an additive `--json` field), and accept hooks as `.cjs` OR `.mjs` (still excluding `*.test.cjs` / `*.test.mjs`) on the copy and the manifest alike. Closes finding F-10 (Medium, architecture).
- layer(s): CLI lib (`src/lib/install-manifest.ts`, `install-capabilities.ts`, `diff.ts`, `update-plan.ts`, `update-report.ts`, `status-report.ts`, one NEW formatter leaf) + CLI command/step renderers (`src/steps/install-archetype.ts`, `src/commands/update.ts`, `src/commands/status.ts`) + tests + user-facing docs. No `pharn-contracts` change. No trusted-doc edit (LIMITS.md text proposed at GATE 2).
- constitution_refs: [P0, P1, P2, P3, P4, P5, P6, P7]

## Discovery (read this run, P6)

- `src/lib/install-capabilities.ts:231-243` copies commands (`pharn-*.md`, not `pharn-dev-*`) and hooks (`endsWith('.cjs')` && not test) through `copyFilteredDir`, which returns silently when the source dir is absent (:556). Settings (:247), trusted docs (:271-277), LICENSE (:286), features README (:321-331), contracts (:334), core (:350), floor (:360) are each `existsSync`-guarded no-ops when absent. Only the trusted docs are reported (init's `docsMissing` warning, `src/steps/install-archetype.ts:255-273`); every other absence is silent.
- `src/lib/install-manifest.ts:86-215` `collectExpectedInstallPaths` mirrors the same list with the same read-side skips (absent / symlinked / not a dir → contributes nothing), hooks predicate `rel.endsWith('.cjs') && !rel.endsWith('.test.cjs')` (:157-162). It is the one manifest consumed by `diff.ts` (status), `update-plan.ts` (update), `overwrite-check.ts` + `install-archetype.ts` (init). So status/update are blind to an absent surface: its paths are simply not expected.
- `src/lib/validate.ts:18` `COPY_FILENAME_RE` already admits `.mjs`; `isTestFile` (`install-capabilities.ts:77`) already matches `.test.mjs`. `lib/hook-wiring.ts` compares settings entries as strings and never enumerates scripts — unaffected.
- `src/lib/layout.ts` / `constants.ts:51-61`: flat `CORE_DIR` is a documented no-op path ("pharn-oss has no root `pharn-core/`") — it must not be declared for `flat`, or every flat accounting would flag it.
- `status` (`src/commands/status.ts:270-296`, JSON path :145-165) diffs at `configLayout(config)` against a fresh clone; `strictFails` (`src/lib/status-report.ts:101-117`) is the single predicate both modes use; `printDriftSection` renders every `InstallDiff` partition (typed on `InstallDiff` so a new partition cannot go unrendered). `tests/status.test.ts` mocks `diffInstalledCapabilities` (its `CLEAN` fixture gains the new field).
- `update`: `buildUpdatePlan` (`src/lib/update-plan.ts`) is the read-only planner shared by the real run and `--dry-run`; `report` is JSON-safe and projected field-by-field by `src/lib/update-report.ts` (`schemaVersion: 1`, additive keys allowed). Renderers: `reportOutcome` (:716) and `reportDryRun` (:984) in `src/commands/update.ts`.
- **Live upstream check (pharn-oss@main, SKILLS_VERSION 6.58.0, codeload tarball extracted into its own scratch dir, nothing executed from it), per surface through the CURRENT manifest code:** detected layout `pharn`. At `pharn`: commands 15, hooks 4 (all `.cjs`, no `.mjs` today), contracts 16, core 28, floor 151, all four trusted docs, `pharn/LICENSE`, `pharn/features/README.md` — **nothing absent**. At `flat` over the same (pharn-layout) clone: contracts 0, core 0, `CONSTITUTION.md`/`ARCHITECTURE.md`/`features/README.md` absent — i.e. exactly what a flat-RECORDED project's `status` would now name (see Open question 2); no real flat clone is fetchable today (main is pharn-layout; the release channel has no releases).
- `LIMITS.md:150-178` §3e names the closed-grammar residual; "a relocated or renamed capability subtree throws" — but a relocated FIXED surface did not throw and was not named. Human-only file (see Open question 7).
- Concurrency: another agent is changing `FLOOR_TEST_FIXTURES_DIR` → a set in `install-manifest.ts` / `install-capabilities.ts` / `constants.ts`. This plan does not touch the floor predicates or the constant; the floor `addDir` call is only wrapped to record its file count.

## Design

1. **`src/lib/install-manifest.ts` — the accounting, single-sourced.**
   - `export type InstallSurface = 'commands' | 'hooks' | 'trusted-doc' | 'license' | 'features-readme' | 'contracts' | 'core' | 'floor'` and `export interface AbsentSurface { surface: InstallSurface; path: string }` (`path` = the clone-relative path pharn looked at; for the features README the layout's preferred path when neither candidate exists).
   - Exported name predicates `isProductCommandFile(name)` and `isInstalledHookFile(name)` (`.cjs` OR `.mjs`, excluding `*.test.cjs` / `*.test.mjs`) — used by BOTH the manifest and `installCapabilities`, so the writer and the mirror cannot disagree on the hook extension again.
   - Internal `collectInstallManifest(params) → { expected, surfaces: {surface, path, files}[] }`: the existing body, with `addDir` returning its count and each fixed-surface block recording one row (one row per trusted doc). `core` is declared only for the `pharn` layout. `collectExpectedInstallPaths` keeps its signature and returns `.expected` (no caller churn).
   - `export function absentInstallSurfaces({ repoDir, layout }): AbsentSurface[]` — the rows whose `files === 0` from `collectInstallManifest({ repoDir, capabilities: [], layout })`, in declaration order. Absent = the surface contributes ZERO files to the manifest (source missing, symlinked, wrong type, or no file passes its filter — e.g. hooks all renamed `.js`). Pure, read-only, never throws beyond what the manifest already throws.
2. **`src/lib/install-capabilities.ts`** — commands/hooks `copyFilteredDir` predicates replaced by the two shared predicates (hooks now copy `.mjs`). Header comment updated (`.cjs`/`.mjs` hooks). No other change (floor block untouched).
3. **`src/lib/absent-surfaces.ts` (NEW, one axis: wording of the absent-surface report)** — `absentSurfaceLines(absent): string[] | null` (null when empty): one line per surface (`<path> (<surface>)`), then the consequence ("installed commands, hooks and checkers that use them will not find them") and the lever ("if pharn-oss moved them, a newer pharn may know the new place: `npm i -g @pharn-dev/pharn@latest`"). Paths are clone-derived names → passed through `terminalSafe`. Shared by init and update (status renders its own DRIFT section, like its other partitions).
4. **`init`** (`src/steps/install-archetype.ts`) — after the copy, `absentInstallSurfaces({ repoDir, layout })` → `log.warn` when non-empty. This REPLACES the docs-only `docsMissing` warning (the docs are rows of the same accounting). Not fatal: install completes, config/records written as today. The outro's "N trusted docs written → …" line (from what the copy actually wrote) stays.
5. **`update`** — `UpdatePlanReport.absentUpstream: AbsentSurface[]` (computed at the CLONE's layout, the one the run writes and records). `reportOutcome` and `reportDryRun` print it as a `NOT SHIPPED` note via the shared lines. Never withholds the version bump and never re-opens the same-version early return (nothing on disk was skipped; the condition is upstream's). `--dry-run --json`: additive `plan.absentUpstream` (`[{surface, path}]`, paths `cap`ped like the other free text).
6. **`status`** — `InstallDiff.absentUpstream: AbsentSurface[]` computed in `diffInstalledCapabilities` at the recorded layout (same inputs as the expected set). `printDriftSection` gains a `NOT SHIPPED UPSTREAM` section (and "No drift" requires it empty) with the remedy: `pharn update` (it installs at the layout upstream now ships); if it persists, upgrade pharn. `strictFails` → true when non-empty. `--json`: additive `drift.absentUpstream`. `--no-drift` → not computed (like the rest of drift).

## Files

- `src/lib/install-manifest.ts` — `InstallSurface`/`AbsentSurface`, shared name predicates (hooks `.cjs`|`.mjs`), internal per-surface accounting, `absentInstallSurfaces` — layer: lib
- `src/lib/install-capabilities.ts` — use the shared predicates; hooks copy `.mjs`; header comment — layer: lib
- `src/lib/absent-surfaces.ts` — NEW: shared warning lines for init/update — layer: lib
- `src/lib/diff.ts` — unchanged (see Resolved decision 2) — layer: lib
- `src/lib/status-report.ts` — `strictFails` input + `drift.absentUpstream` in the JSON report — layer: lib
- `src/lib/update-plan.ts` — `report.absentUpstream` — layer: lib
- `src/lib/update-report.ts` — additive `plan.absentUpstream` projection — layer: lib
- `src/steps/install-archetype.ts` — unified absent-surface warning (replaces docs-only warning) — layer: step
- `src/commands/update.ts` — `NOT SHIPPED` note in `reportOutcome` + `reportDryRun` — layer: command
- `src/commands/status.ts` — DRIFT `NOT SHIPPED UPSTREAM` section; strict inputs — layer: command
- `tests/install-manifest.test.ts` — accounting + `.mjs` hooks + mirror pin — layer: tests
- `tests/install-capabilities.test.ts` — `.mjs` hook copied, `.test.mjs` not — layer: tests
- `tests/absent-surfaces.test.ts` — NEW: formatter — layer: tests
- `tests/diff.test.ts`, `tests/status.test.ts`, `tests/status-report.test.ts` — partition, rendering, `--strict`, `--json` field; `CLEAN` fixture gains `absentUpstream: []` — layer: tests
- `tests/update.test.ts` / `tests/update-dry-run.test.ts` / `tests/update-dry-run-json.test.ts` / `tests/update-report.test.ts` — note + JSON field; any existing fixture now flagged gets the surface or an expectation — layer: tests
- `tests/init-archetype.test.ts` — unified warning (the existing docs-warning pins move to it) — layer: tests
- `docs/commands/status.md`, `docs/commands/update.md`, `docs/commands/init.md` (install lists say `.cjs`/`.mjs` hooks; the new warning/section; `--strict`; JSON field), `docs/contributing.md` test table if it lists files (check at build), `CLAUDE.md` (`installCapabilities` paragraph + status paragraph), `CHANGELOG.md` `[Unreleased]` `### Fixed` — layer: docs

- `README.md`, `docs/README.md`, `docs/getting-started.md` — ADDED AT BUILD (declared here before regress, not silently): each says the install ships "`.cjs` hooks", which became untrue with `.mjs` hooks; one-word sync to `.cjs`/`.mjs` — layer: docs

- `tests/status-json.test.ts` — ADDED AT BUILD (first `check-regress.mjs scope` run flagged it as escaped; declared here, not silently): the `status --json` command tests needed the new seam mock and the `drift.absentUpstream` / `layout` / `--strict` pins that Resolved decision 2 requires — layer: tests

- `src/lib/orphans.ts`, `tests/orphans.test.ts`, `tests/uninstall.test.ts` — ADDED AT REBASE onto #282/#285 (GATE 2 instruction): `isInstallRootPath` now uses the shared `isProductCommandFile`/`isInstalledHookFile`, so orphan detection and `pharn uninstall` treat `.claude/hooks/*.mjs` as an install path — layer: lib + tests
- `src/lib/init-plan.ts`, `src/lib/init-report.ts`, `src/commands/init.ts`, `tests/init-report.test.ts`, `tests/init-dry-run.test.ts`, `tests/init-dry-run-json.test.ts` — ADDED AT REBASE onto #283 (GATE 2 instruction): `init --dry-run` prints the not-shipped warning (preview wording) and `--dry-run --json` carries `absentUpstream` (present only when non-empty) — layer: lib + command + tests
- `docs/reference/pharn-records.md` — ADDED AT REBASE: its install-root description names `.mjs` hooks — layer: docs

## Contracts satisfied

- No `pharn-contracts` file governs the install set. The JSON reports' stability contract (`schemaVersion: 1`, additive keys allowed — `status-report.ts`/`update-report.ts` headers) is kept: only new keys. The install manifest's "single source of truth" contract (`install-manifest.ts` header) is extended, not forked (P4).

## Evals to write (P1)

- manifest: every declared surface present → `absentInstallSurfaces` = `[]` (both layouts, fixture clones)
- each surface removed in turn (commands dir, hooks dir, one trusted doc, LICENSE, features README, contracts, core [pharn], floor) → exactly that row named with its path
- flat layout never reports `core`; pharn layout does
- commands dir present but holding only `pharn-dev-*.md` / non-`pharn-` files → `commands` absent; hooks dir holding only `*.test.cjs` / `.js` → `hooks` absent
- symlinked surface root → absent (matches the copy, which refuses it)
- hooks: `x.mjs` in manifest AND copied; `x.test.mjs` / `x.test.cjs` in neither; existing mirror test (manifest == real install) still passes with an `.mjs` hook in the fixture
- formatter: empty → null; lines terminal-safe for a hostile path
- init: clone missing hooks + contracts → `log.warn` naming both, install still completes (config + records written, exit 0); a clone missing a doc → the doc named in the same warning; complete clone → no warning
- update: plan reports `absentUpstream`; text run + dry-run print `NOT SHIPPED`; `--dry-run --json` carries `plan.absentUpstream`; version bump NOT withheld by it
- status: DRIFT section lists it; non-strict exit 0; `--strict` exit 1 when it is the ONLY finding; `--json` `drift.absentUpstream` and `strict.failed`; `--no-drift` → `drift: null` unchanged
- live upstream (manual, recorded in VERIFY.md): current pharn-oss main → zero absent surfaces at its own layout
- `CI=1 npx vitest run --maxWorkers=2`, `npm run check`, `npm run build`, `npm run test:coverage` thresholds hold

## Guarantee audit (P0)

- "Every declared surface upstream does not ship is named by init/update/status" → floor: deterministic set membership (a surface's file count from the same enumeration that builds the manifest == 0), single-sourced so the copy, update's writes and status's diff agree by construction; pinned by tests. NOT claimed: that the declared list itself is complete — it is still a closed, CLI-side list (the §3e residual narrows, it does not close). A brand-new surface upstream adds is still not installed and not named; upstream's `MIN_CLI` remains the lever.
- "`status --strict` fails on an absent surface" → control flow through the one `strictFails` predicate, tested in both modes.
- "Hooks are `.cjs` or `.mjs`" → enum-regex style suffix membership, shared predicate, tested on both write paths.
- "Wired hooks reference installed scripts" → NOT claimed (no command-string parsing; see Open question 6). Advisory: an absent `hooks` surface is named; an individual missing script wired by a present-but-partial hooks dir is not.

## Trust audit (P2)

- Input: the untrusted clone tree (names + existence only; contents never read by this accounting). Surface paths in the report are CLI-owned constants or layout-resolved constants — not clone-supplied — so taint is limited to the boolean "present/absent"; still routed through `terminalSafe`/JSON escaping like every other path. Hook filenames newly admitted (`.mjs`) still pass `COPY_FILENAME_RE` + no-`..` before any join; symlink skips unchanged.

## Determinism audit (P5)

- Branches: suffix membership for hooks/commands, `files === 0`, `layout === 'pharn'` for declaring `core`, `length > 0` for reporting. No classification by guess.

## Out of scope (P7)

- Parsing upstream `settings.json` hook commands to cross-check each wired script (Open question 6); new surfaces upstream may add; a fatal init; the flat `.dev/floor` artifact noted above; any edit to `FLOOR_TEST_FIXTURES_DIR` handling; version bump; LIMITS.md edit by the agent.

## Open questions (HALT)

1. **init/update: warn or fatal?** Recommended: WARN (install completes; a hard failure would block every install the moment upstream reorganizes, and upstream's `MIN_CLI` is the intended lever). The code agrees: the only precedent (init's `docsMissing`) is a warning, and LIMITS §3e calls the lever upstream's. `status --strict` FAILS on it.
2. **Flat-recorded projects vs today's pharn-layout upstream.** `status` diffs at the RECORDED layout, so a project still recorded `flat` will now see `CONSTITUTION.md`, `ARCHITECTURE.md`, `features/README.md`, `pharn-contracts` named NOT SHIPPED and `--strict` failing until `pharn update` (which moves it to the clone's layout). Today that drift is invisible. Recommended: yes, report it — the remedy line names `pharn update` first.
3. **`core` on flat** — not declared (documented no-op path). Recommended: yes.
4. **Absence = zero files contributed** (covers renamed extensions / emptied dirs, not just a missing dir). Recommended: yes.
5. **Unify init's docs-only warning into the new one** (one warning, docs are rows). Recommended: yes; the outro's "trusted docs written → …" line stays.
6. **Per-script wired-hook cross-check** — out of scope; stated as residual. Recommended: out of scope.
7. **LIMITS.md §3e** — not edited; replacement text proposed at GATE 2 (adds: a relocated/renamed FIXED surface is named by init/update and fails `status --strict`, but the declared list is still CLI-side and closed). Recommended: yes.
8. **update does not withhold the version bump for an absent surface.** Recommended: yes (nothing on disk was skipped; status keeps flagging it).
9. **Note titles:** update `NOT SHIPPED`; status DRIFT section `NOT SHIPPED UPSTREAM`; JSON key `absentUpstream` (`[{surface, path}]`). Recommended: yes.

## Resolved decisions (GATE 1, 2026-10-13)

GATE 1 passed: approved with one change (Q2).

1. init/update WARN (never fatal); `status --strict` FAILS on an absent surface.
2. **Changed:** `absentUpstream` means exactly "upstream ships zero files for this surface" — so it is computed at the CLONE's own layout (`detectLayout(repo.dir)`) in `status` as well as `update`, never at the recorded layout. A recorded layout that differs from the clone's is reported by `status` as a SEPARATE advisory line (recorded `<x>`, upstream now ships the `<y>` layout; run `pharn update` to move) — status reports this nowhere today, so the line is new. It is NOT a `--strict` input; its strict behaviour stays what it is today, pinned by a test. Consequence for the design: `InstallDiff` is not extended; `status` calls `absentInstallSurfaces` at the clone layout and passes the result alongside the diff (DRIFT section, `strictFails`, `--json` `drift.absentUpstream`); the layout pair goes to `--json` as an additive top-level `layout: {recorded, upstream}` (`upstream` null under `--no-drift`).
3. `core` not declared for `flat`.
4. Absent = the surface contributes zero files.
5. init's docs-only warning folds into the unified warning; the outro docs line stays.
6. Per-script wired-hook cross-check out of scope; listed as a remaining gap in docs + CHANGELOG.
7. LIMITS.md §3e not edited; replacement text at GATE 2.
8. An absent surface never withholds the version bump.
9. Names: update note `NOT SHIPPED`, status section `NOT SHIPPED UPSTREAM`, JSON key `absentUpstream` (`[{surface, path}]`).

Process: `.pharn/writes-scope.json` restored before every commit, never committed. Other agents edit `update-plan.ts`, `update.ts`, `status.ts`, `status-report.ts` — edits there stay localized.
