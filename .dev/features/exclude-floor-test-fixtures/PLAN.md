# PLAN — exclude the floor's test-fixtures from a product install

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Stop copying upstream's `pharn/floor/test-fixtures/` into user projects — dev test apparatus whose only readers are the `*.test.mjs` files the install already excludes — by extending the writer's `cpSync` filter and its read-only manifest mirror in lockstep, matching a floor-RELATIVE path segment single-sourced as one constant.
- layer(s): `src/lib` (one constant + two lockstep predicates), `tests`, `docs`
- constitution_refs: [P2, P3, P4, P5, P7]

## Discovery (P6 — read live this run)

- `src/lib/install-capabilities.ts:53` — `isTestFile` matches `*.test.{mjs,cjs}` only; `:176-184` — the floor `cpSync` with `filter: (src) => !isTestFile(src) && noSymlinks(src)`.
- `src/lib/install-manifest.ts` — the mirror's `addDir(paths.floor, (rel) => !/\.test\.(mjs|cjs)$/.test(rel))`, where `rel` is ALREADY posix and floor-relative (`walkFiles` builds it with `/`).
- Upstream `/Users/pgalarowicz/Projects/pharn-oss` at `2e183e6`: `pharn/floor/test-fixtures/` exists and its files are read only by `check-structural.test.mjs` / `validate.test.mjs` — both excluded from the install. Count measured in the build.
- `tests/helpers.ts` — scaffolds live under `mkdtempSync(join(tmpdir(), 'pharn-test-'))`, so no path component ever contains `test-fixtures`. **The existing mirror pin therefore could NOT catch an unanchored writer predicate** — it would stay green. The anchor is the guarantee; the pin is not.

## Files

- `src/lib/constants.ts` — `FLOOR_TEST_FIXTURES_DIR = 'test-fixtures'`, beside the floor constants — layer `lib`
- `src/lib/install-capabilities.ts` — the floor filter excludes the subtree, anchored at `floorFrom`; header narration corrected — layer `lib`
- `src/lib/install-manifest.ts` — the same two-branch test on the same floor-relative string; doc comment corrected — layer `lib`
- `tests/install-capabilities.test.ts` — fixtures in the scaffolds; the subtree is not installed; a same-named ancestor does not prune the floor; `my-test-fixtures.mjs` survives — layer `tests`
- `tests/install-manifest.test.ts` — the mirror pin runs over a scaffold that actually CONTAINS a fixture file (else it passes vacuously) — layer `tests`
- `docs/commands/init.md`, `docs/commands/status.md`, `CLAUDE.md`, `CHANGELOG.md` — the copied-set enumerations — layer `docs`

## Contracts satisfied

- The **mirror invariant** — both predicates test the SAME floor-relative string, so their equivalence is readable at a glance rather than argued.

## Evals to write (P1)

- flat + pharn install: no `test-fixtures/` file lands anywhere under the installed floor dir.
- the manifest omits every `test-fixtures/` key in both layouts.
- **the anchor**: a clone whose FLOOR ROOT sits under an ancestor directory literally named `test-fixtures` still installs the floor whole — an unanchored absolute-path match would return `false` for the source root and copy NOTHING.
- a sibling named `my-test-fixtures.mjs` (and a file `test-fixtures.md`) is still installed — the test is a segment, not a substring.
- the existing mirror pin passes with a fixture file present in the scaffold.

## Guarantee audit (P0)

- "no floor test apparatus reaches a user project" → **floor: a fixed-name segment membership test**, applied identically on both sides; pinned by tests in both layouts.
- "writer and mirror cannot disagree" → **floor: the existing mirror pin**, but ONLY once the scaffold contains a fixture file. Recorded honestly: the pin as it stands today would pass vacuously, so making the scaffold carry a fixture is part of the guarantee, not decoration.
- "an ancestor named test-fixtures cannot prune the whole floor copy" → **floor: test**. This is the failure mode an unanchored predicate produces, and it is silent — the install simply ships no floor.
- "existing installs are cleaned up" → **NOT CLAIMED.** `update` never deletes; the 16 files already on disk stay and simply fall out of the expected set, becoming untracked user files. No deletion path is added.

## Trust audit (P2)

The new predicate is an ADDITIONAL exclusion layered on top of `noSymlinks` / `isSymlink` / `findSymlinkComponent`, never a replacement. It is a pure string test on a path already `safeJoin`-contained; it cannot let a name skip containment because it only ever removes paths from the set.

## Determinism audit (P5)

A membership test over one fixed name, normalized through the existing `toPosix` so both sides agree on win32. No content scan, no heuristic.

## Out of scope (P7)

- Any deletion path in `update` or cleanup in `status` for fixtures already installed.
- `update-decision.ts` / `apply-update.ts` / `install-records.ts`.
- The upstream suggestion that `pharn/floor/` separate runtime checkers from test apparatus structurally — noted, not waited on.

## Open questions (HALT)

- None.
