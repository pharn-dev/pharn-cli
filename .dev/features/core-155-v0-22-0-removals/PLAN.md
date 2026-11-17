# PLAN — core-155-v0-22-0-removals (epic CORE-155, support policy v0.22.0)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: retire three v0.22.0 compatibility shims of the support policy in one change — the `flat` layout, `PHARN_ROOT_FALLBACK_DOCS` (with `resolveTrustedDocs`), and the root-footprint migration (`src/lib/root-migration.ts`) — meeting each shape they handled with the CLI's one "re-run `pharn init`" answer or the general orphan path, never a silent misbehaviour and never a lost file.
- base: origin/main @ b90305f6 (v0.20.0 released, #402 merged for v0.21.0). Branch `przemek/core-155-v0-22-0-removals`. Draft until v0.21.0 is cut.
- layer(s): CLI libs and commands (`src/`), tests, user docs, CHANGELOG `[Unreleased]`, `CLAUDE.md` module map.
- constitution_refs: [P0, P3, P4, P5, P7]

## Why (discovery, live state this run)

- `docs/contributing.md` "Shims to retire" names the three rows and where each lives; `docs/support-policy.md` says v0.22.0 stops handling them. The fourth v0.22.0 row (the derivation fallback for a tree without `pharn-install.json`) is open PR #404, another session: its code (install-manifest's derivation walk, capability-index's frontmatter port, upstream-models' root read) is NOT touched here beyond the one `resolveTrustedDocs` call that item 2 removes. #404 also deletes `resolveTrustedDocs`/`PHARN_ROOT_FALLBACK_DOCS`; where both PRs remove the same lines this PR mirrors #404's resulting text, so whichever merges second resolves trivially.
- Pre-archetype refusal precedent: `loadArchetypeConfig` (`src/lib/pharn-config.ts`) throws one `CliError` line for add/remove/update/list/status/uninstall. `init` reads the previous config tolerantly (`readPreviousConfig`) and is the way back.
- `flat` reaches: `layout.ts` (`detectLayout`, `layoutPaths`, `configLayout`, `flatDeprecationLines`), `types.ts` (`Layout`), `pharn-config.ts` (layout survives only as pharn/flat), `status.ts` + `status-report.ts` (layout mismatch → `drift: null`, LAYOUT note, DEPRECATED), `update.ts` (DEPRECATED), `update-plan.ts` (`previousLayout`, `abandonedLayout`), `update-render.ts` (layout warnings), `update-report.ts` (`plan.abandonedLayout`), `update-next.ts` (`configLayout` in `loadResolved`), `add.ts` (`layoutGate`), `remove.ts`, `init-plan.ts` (`previousLayout`), `install-archetype.ts`, `install-surfaces.ts` (`layoutPaths('flat')`).
- Root migration reaches: `init-plan.ts`, `update-plan.ts`, `update.ts`, `init.ts`, `install-archetype.ts`, `update-render.ts`, `update-report.ts` (`plan.rootMigration`), `update-next.ts` (`changesNoFiles`, `retired`).
- The test harness's default `upstreamTree` is still the pre-7.0 shape (root THREAT-MODEL.md/LIMITS.md); without the fallback it must become the 7.x shape (#404 does the same).
- Baseline: `CI=1 npx vitest run --maxWorkers=2` at b90305f6 → 105 files, 3704 passed, 1 skipped.

## Behaviour decisions (stated, the simplest safe)

1. **A project still recorded at `flat` (`"layout": "flat"`, no `layout` key, or any value but `"pharn"`)** gets one refusal, exit 1, from every command that loads the config through `loadArchetypeConfig` (add, remove, update incl. `--dry-run`/`--json`, list, status incl. `--json`, uninstall), naming the flat layout, v0.22.0, and `pharn init` as the way back. `update` does NOT keep the move: `init` already re-installs at `pharn/`, carries `manual` capabilities, backs up what it overwrites, and never moves or deletes the old top-level copies — the same end state as the old move, through the one documented door. Nothing is written by a refused command.
   - After the re-run `init`, old top-level files that pharn recorded stay on disk and stay recorded as orphans (listed under ORPHANED by `status`/`update`, removable by `uninstall` by their record hash) — because `install-surfaces.ts` keeps recognising the legacy root paths as paths an install before v0.22.0 wrote (classification of records only; no command installs there). A dropped capability's old flat directory is left on disk (init plans removals at `pharn/` paths only).
2. **A fetched tree without `pharn/pharn-contracts` (a flat pharn-oss)**: `detectLayout` throws a `ManifestValidationError` naming the flat layout and v0.22.0 and the fix (latest release / `--ref main`); nothing is written. With a manifest this is already refused by `checkLayout`; this covers the derivation path until #404 removes it.
3. **`PHARN_ROOT_FALLBACK_DOCS`/`resolveTrustedDocs` removed**: the trusted docs are installed only from `pharn/<doc>`; a clone keeping THREAT-MODEL.md/LIMITS.md only at the root has them named under NOT SHIPPED UPSTREAM (`absentInstallSurfaces`), never installed from the root.
4. **Root-footprint migration removed**: `init`/`update` no longer delete root THREAT-MODEL.md/LIMITS.md, print no ROOT MIGRATION note, no user-data/`.pharn/`/`.gitignore` hints. A recorded root doc is an ordinary orphan (ORPHANED, never deleted by update; `uninstall` removes it by record). Root `memory-bank/`, `pharn.spec-template.md`, `.pharn/` are never touched (as before).
5. **`--json` `schemaVersion: 1` stays byte-compatible**: `update --json` keeps `plan.layout` (`"pharn"`), `plan.abandonedLayout` (constant `null`) and `plan.rootMigration` (constant `null`), each commented as a constant kept for schemaVersion 1. `status --json` keeps `layout: {recorded, upstream}` (`"pharn"`, `upstream` `null` under `--no-drift`); `drift` is null only under `--no-drift` now.
6. The `Layout` type keeps one member, `'pharn'` (the value `init`/`update` still write — 0.21.x reads an absent key as flat, so `layout` keeps being written). `layoutPaths(layout)` keeps its signature (its only value), so the derivation code #404 deletes is not edited.

## Files

- `src/types.ts` — `Layout = 'pharn'`; `layout` comment — lib
- `src/lib/layout.ts` — drop flat branch, `configLayout`, `flatDeprecationLines`, `resolveTrustedDocs`; `detectLayout` refuses a non-pharn tree; `resolveFeaturesReadme` pharn-only — lib
- `src/lib/constants.ts` — drop `PHARN_ROOT_FALLBACK_DOCS`; legacy root constants re-described as old-record paths — lib
- `src/lib/root-migration.ts` — DELETED — lib
- `src/lib/pharn-config.ts` — `FLAT_LAYOUT_MESSAGE`, refusal in `loadArchetypeConfig`, `layout` keeps only `'pharn'` — lib
- `src/lib/install-surfaces.ts` — legacy root paths from constants instead of `layoutPaths('flat')` — lib
- `src/lib/install-capabilities.ts` — docs from `paths.docs` — lib
- `src/lib/install-manifest.ts` — the one `resolveTrustedDocs` call → `paths.docs` — lib
- `src/lib/upstream-manifest.ts` — `checkLayout` marker probe without `detectLayout`'s throw — lib
- `src/lib/init-plan.ts` — drop `previousLayout`, root migration — lib
- `src/lib/update-plan.ts` — drop `previousLayout`, `abandonedLayout`, root migration — lib
- `src/lib/update-render.ts` — drop root-migration note and abandoned-layout warnings — lib
- `src/lib/update-report.ts` — `abandonedLayout`/`rootMigration` constants `null` — lib
- `src/lib/update-next.ts` — drop `configLayout`, `retired`, root-doc deletes — lib
- `src/lib/status-report.ts` — drop `layoutMismatch`, `upstreamLayout` input — lib
- `src/commands/status.ts` — drop DEPRECATED, LAYOUT note, mismatch — command
- `src/commands/update.ts` — drop DEPRECATED, root-doc delete/recheck — command
- `src/commands/init.ts` — drop ROOT MIGRATION note lines — command
- `src/commands/add.ts` — drop `layoutGate` — command
- `src/commands/remove.ts` — `layoutPaths('pharn')` — command
- `src/steps/install-archetype.ts` — drop root-doc delete and note; removals at pharn paths — step
- `tests/support/harness.ts` — rewritten in place for the removals — test
- `tests/root-migration.test.ts` — rewritten in place for the removals — test
- `tests/layout.test.ts` — rewritten in place for the removals — test
- `tests/status-report.test.ts` — rewritten in place for the removals — test
- `tests/update-report.test.ts` — rewritten in place for the removals — test
- `tests/update-render.test.ts` — rewritten in place for the removals — test
- `tests/update-next.test.ts` — rewritten in place for the removals — test
- `tests/update-plan.test.ts` — rewritten in place for the removals — test
- `tests/install-capabilities.test.ts` — rewritten in place for the removals — test
- `tests/install-manifest.test.ts` — rewritten in place for the removals — test
- `tests/upstream-manifest.test.ts` — rewritten in place for the removals — test
- `tests/pharn-config.test.ts` — rewritten in place for the removals — test
- `tests/capability-dir.test.ts` — rewritten in place for the removals — test
- `tests/capability-removal.test.ts` — rewritten in place for the removals — test
- `tests/diff.test.ts` — rewritten in place for the removals — test
- `tests/executable-unit.test.ts` — rewritten in place for the removals — test
- `tests/init-report.test.ts` — rewritten in place for the removals — test
- `tests/orphans.test.ts` — rewritten in place for the removals — test
- `tests/uninstall-plan.test.ts` — rewritten in place for the removals — test
- `tests/prettierignore.test.ts` — rewritten in place for the removals — test
- `tests/overwrite-check.test.ts` — rewritten in place for the removals — test
- `tests/write-targets.test.ts` — rewritten in place for the removals — test
- `tests/init-plan.test.ts` — rewritten in place for the removals — test
- `tests/commands/init.test.ts` — rewritten in place for the removals — test
- `tests/commands/init-dry-run.test.ts` — rewritten in place for the removals — test
- `tests/commands/update.test.ts` — rewritten in place for the removals — test
- `tests/commands/update-dry-run.test.ts` — rewritten in place for the removals — test
- `tests/commands/status.test.ts` — rewritten in place for the removals — test
- `tests/commands/add.test.ts` — rewritten in place for the removals — test
- `tests/commands/remove.test.ts` — rewritten in place for the removals — test
- `tests/commands/uninstall.test.ts` — rewritten in place for the removals — test
- `tests/commands/list.test.ts` — rewritten in place for the removals — test
- `tests/capability-index.test.ts` — rewritten in place for the removals — test
- `tests/install-records.test.ts` — rewritten in place for the removals — test
- `tests/install-surfaces.test.ts` — rewritten in place for the removals — test
- `tests/repo-signals.test.ts` — rewritten in place for the removals — test
- `tests/model-config-parity.test.ts` — rewritten in place for the removals — test
- `docs/README.md` — the removals, in user-facing words — docs
- `docs/architecture.md` — the removals, in user-facing words — docs
- `docs/contributing.md` — the removals, in user-facing words — docs
- `docs/getting-started.md` — the removals, in user-facing words — docs
- `docs/roadmap.md` — the removals, in user-facing words — docs
- `docs/support-policy.md` — the removals, in user-facing words — docs
- `docs/troubleshooting.md` — the removals, in user-facing words — docs
- `docs/commands/add.md` — the removals, in user-facing words — docs
- `docs/commands/init.md` — the removals, in user-facing words — docs
- `docs/commands/remove.md` — the removals, in user-facing words — docs
- `docs/commands/status.md` — the removals, in user-facing words — docs
- `docs/commands/update.md` — the removals, in user-facing words — docs
- `docs/commands/uninstall.md` — the removals, in user-facing words — docs
- `docs/reference/pharn-config.md` — the removals, in user-facing words — docs
- `README.md` — the removals, in user-facing words — docs
- `CLAUDE.md` — the removals, in user-facing words — docs
- `CHANGELOG.md` — the removals, in user-facing words — docs
- `tests/**` — rewritten in place (no test file or title deleted): `tests/root-migration.test.ts`, `tests/layout.test.ts`, `tests/status-report.test.ts`, `tests/update-report.test.ts`, `tests/update-render.test.ts`, `tests/update-next.test.ts`, `tests/update-plan.test.ts`, `tests/install-capabilities.test.ts`, `tests/install-manifest.test.ts`, `tests/upstream-manifest.test.ts`, `tests/pharn-config.test.ts`, `tests/support/harness.ts`, `tests/commands/*.test.ts` and any other test the change breaks — test
- `docs/**`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` — docs
- `.dev/features/core-155-v0-22-0-removals/**` — stage artifacts

## Contracts satisfied

- `docs/contributing.md` "Support policy": every shim removed on its named version, a `### Removed` CHANGELOG line naming 0.21.x as the last CLI that handled it, tests rewritten never deleted, `--json` keys kept as constants (cite, do not restate, P4).
- `CLAUDE.md` invariants: records are the proof (no new delete path; the root-doc delete path is removed), containment, `--json` byte stability.

## Evals to write (P1) — tests, rewritten in place

- flat config → each of add/remove/update(--dry-run --json)/list/status(--json)/uninstall exits 1 with the one message, writes nothing.
- re-run `init` on a flat install → installs `pharn/`, carries manual capabilities, leaves every old top-level file in place; `status` lists the recorded ones as ORPHANED.
- flat clone (no `pharn/pharn-contracts`) → init/update/add/status refuse naming the flat layout; nothing written.
- pre-7.0 clone (root docs only) → root docs not installed; named NOT SHIPPED UPSTREAM.
- pre-7.0 install (recorded root THREAT-MODEL.md/LIMITS.md) → update/init leave them, listed ORPHANED; no ROOT MIGRATION note; `update --json` `plan.rootMigration` is `null`.
- `layout`: `detectLayout` returns `pharn` / throws; `layoutPaths('pharn')` paths; `readPharnConfig` drops a non-`pharn` layout.

## Guarantee audit (P0)

- "a flat config is refused by every config-reading command" → floor: one membership test (`config.layout !== 'pharn'`) in the single loader they all call, pinned by command tests.
- "no file is lost" → floor: the change only REMOVES delete paths (root-doc unlink; init's removals now target `pharn/` paths only); every remaining delete is the existing records-hash-gated path.
- "`--json` stays byte-identical for current installs" → floor: keys kept as constants; pinned by update-report/status-report tests. For a former flat/pre-7 install the values differ only because the command now refuses / does nothing there (documented).
- "init leaves old top-level copies listed as ORPHANED" → floor: existing `findOrphans` over the kept legacy root bound; pinned by an init+status test.

## Trust audit (P2)

- No new untrusted input. A fetched tree's layout is still decided by an existence probe of a fixed path under `safeJoin`; the refusal message carries no tree text.

## Open questions (HALT)

- None: the delegating agent made the decisions this run's to take and asked for the simplest safe behaviour; decisions 1–6 above are that choice.

## Addendum — target moved to v0.21.0 (owner decision, mid-build)

The owner moved these three removals from v0.22.0 to v0.21.0, to merge as soon as green (no draft).
Every "v0.22.0" above for these three shims reads v0.21.0, and the last CLI that handles each is
0.20.x (not 0.21.x). The derivation fallback (#404) keeps its own v0.22.0 target. The branch and this
feature folder keep their original names.

## Addendum — rebased onto #404 (merged mid-build)

#404 (the derivation fallback, C8.3) merged as f979a839 with #405, and itself removed
`PHARN_ROOT_FALLBACK_DOCS`/`resolveTrustedDocs` and made every tree without `pharn-install.json`
refuse at the fetch. This branch was rebased onto it: item 2 above is now #404's (this change only
drops the stale `root-migration.ts` mention from that shim row), a flat or pre-7.0 tree is refused by
the fetch before `detectLayout` runs, and every test file #404 rewrote was taken from main with only
the flat/root-footprint tests rewritten on top, so no title of main's is dropped.
