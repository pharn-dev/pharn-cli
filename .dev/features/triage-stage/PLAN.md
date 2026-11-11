# PLAN — triage-stage (accept pharn-oss 7.7.0's `triage` product stage in the `models` block)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: port pharn-oss 7.7.0's new product stage `triage` into `src/lib/model-config.ts`
  (`PRODUCT_STAGES`, after `grill`), refresh the vendored checker the parity test runs (plus the
  `frontmatter-core.mjs` it now imports), update the stage-enumerating tests and user docs, and
  release it as 0.18.1.
- layer(s): the CLI itself (`src/lib`), tests + vendored test fixtures, user docs, release metadata
- constitution_refs: [P0, P1, P2, P3, P4, P7]

## Why (P7 — a real need, verified this run)

- pharn-oss `main` @ `3afbb125` (SKILLS_VERSION 7.7.1; fetched this run). Its checker
  `pharn/floor/check-model-config.mjs` (last changed in `4467407d`, 7.7.0) has
  `triage: "pharn-triage.md"` between `grill` and `build` in `PRODUCT_STAGES`. Smoke-run this run:
  `validate` over `{"default":…,"triage":{"model":"opus","effort":"high"}}` → GREEN, exit 0;
  `resolve triage` → `{"model":"opus","effort":"high"}`.
- pharn-cli 0.18.0's copy (`src/lib/model-config.ts:40-52`) lacks `triage`, so `checkModelsBlock`
  REDs `stage "triage" is not a product stage`. Effect today: `pharn status` prints the block as
  invalid, and a block carrying the key is NOT applied by `init`/`update` (LIMITS.md §3e, "named,
  never fatal"). pharn-oss 7.7.1 deliberately does not tell users to add the key for this reason.
- `v7.7.0` is pharn-oss's latest verified release (`gh release list`), so a default `pharn init`
  already installs `/pharn-triage`; only the `triage` KEY is refused.
- pharn-oss's shipped root `pharn.config.json` has no `triage` key (it resolves through `default`),
  so no released CLI rejects pharn-oss's own block: `MIN_CLI` (0.14.0) needs nothing now
  (docs/contributing.md refresh step 4 does not fire). If pharn-oss later ships a `triage` key in
  its block, it must first raise `MIN_CLI` to the CLI that carries this change (0.18.1).

## Discovery — verified this run (P6)

- Consumers of `PRODUCT_STAGES` in `src/`: `model-config.ts` (validator RED text) and
  `model-config-format.ts` `resolveStageRows` (iterates it → `status`/`init` MODELS notes,
  `status --json`). Both pick up the new member with no further code change.
- Diff vendored checker (pinned `361bc3ce…`, pharn-oss `767bf61`, 6.22.0) vs `origin/main`: the
  `validateStages` / `resolveStage` logic and RED wording are unchanged; the deltas are the `triage`
  key, comments ("eleven" → "twelve"), the frontmatter parse now delegated to `./frontmatter-core.mjs`
  (agreement mode only), and `process.exitCode = main()` instead of `process.exit(main())`.
- The new checker has a static `import … from "./frontmatter-core.mjs"`, so the vendored copy
  cannot load without that sibling. `frontmatter-core.mjs` (last changed `73a2bfc7`) has no imports.
- The parity test's extraction anchors (`const PRODUCT_STAGES = {` … `const DEFAULT_CONFIG`) still
  exist upstream, and the lifted block references neither import.
- Gates: `format:check` globs only `*.ts`; `npx eslint` over both new `.mjs` files → exit 0
  (probed this run). So the byte-for-byte vendored files pass every gate unedited.
- Stage lists / counts found by a case-insensitive sweep (excluding `.dev/` history and released
  CHANGELOG entries, which stay as written): `docs/reference/pharn-config.md:238` (stage-names
  rule row), `docs/getting-started.md:130` ("Two of the eleven installed commands"),
  `README.md` (pipeline table + out-of-pipeline table, no `/pharn-triage`), tests
  `model-config-format.test.ts:28-62` (two hard-coded lists), `status.test.ts:792` (`toContain`
  only — still passes; one assertion added).

## Files

- `src/lib/model-config.ts` — add `'triage'` after `'grill'` in `PRODUCT_STAGES` — layer: CLI lib
- `tests/fixtures/pharn-oss/check-model-config.mjs` — replaced byte-for-byte from pharn-oss
  `origin/main` @ `3afbb125` — layer: vendored test fixture
- `tests/fixtures/pharn-oss/frontmatter-core.mjs` — NEW, byte-for-byte from the same commit (the
  checker's one sibling import) — layer: vendored test fixture
- `tests/model-config-parity.test.ts` — re-pin: `PINNED_SHA256` + the commit / SKILLS_VERSION
  comment; add a sha256 pin for `frontmatter-core.mjs`; add corpus blocks with a `triage` entry
  (valid, and a bad-model one so the RED path is compared too) — layer: tests
- `tests/model-config-format.test.ts` — add the `triage` row to both enumerated lists — layer: tests
- `tests/model-config.test.ts` — one direct case: a `triage` key is `valid` and resolves to its own
  entry — layer: tests
- `tests/status.test.ts` — assert the MODELS note shows a `triage` row resolved through default —
  layer: tests
- `tests/init-archetype.test.ts` — (added during build, 2026-11-11) its "a stage pharn-oss
  rejects" example was `triage`; switch it to `deploy`, a name pharn-oss has no stage for — layer: tests
- `tests/update.test.ts` — (added during build) same: two `triage` stand-ins → `deploy` — layer: tests
- `tests/models-update.test.ts` — (added during build) same, reason strings only — layer: tests
- `tests/pharn-config.test.ts` — (added during build) same, "a newer format" example — layer: tests
- `docs/contributing.md` — refresh procedure step 1 names the sibling: copy every pharn-oss file the
  checker imports, each pinned — layer: docs
- `docs/reference/pharn-config.md` — add `triage` to the stage-names row; one sentence that
  pharn-oss's block names no `triage` key, so it resolves through `default`, and that pharn before
  0.18.1 refuses a block that names it — layer: docs
- `docs/getting-started.md` — "eleven installed commands" → an open phrase; one sentence that a full
  `/pharn-loop` also runs `/pharn-triage` after the grill — layer: docs
- `README.md` — mention `/pharn-triage` (in the `/pharn-loop` paragraph, not as a `/pharn-ship`
  pipeline row, since `/pharn-ship` does not run it) — layer: docs
- `CHANGELOG.md` — `## [0.18.1] — 2026-11-11` / `### Fixed` entry + compare links — layer: release
- `tests/release-consistency.test.ts` — (added during build) add `v0.18.0` to `KNOWN_TAGS`, the
  documented step for the bump after a release (docs/RELEASING.md step 2) — layer: tests
- `package.json`, `package-lock.json` — `npm version --no-git-tag-version 0.18.1` — layer: release

## Contracts satisfied

- `pharn-contracts` — none touched. The `models` schema is pharn-oss's; this is the refresh
  procedure in `docs/contributing.md` ("pharn-oss's `models` rules — a pinned copy"), steps 1–4.

## Evals to write (P1)

- parity: `PRODUCT_STAGES` keys equal the vendored checker's, in order → passes only with `triage`
  after `grill` (fails today against the refreshed fixture).
- parity: vendored checker + `frontmatter-core.mjs` match their sha256 pins.
- parity corpus: block with a valid `triage` entry → checker GREEN = copy `valid`; block with
  `triage` model `"gpt-4"` → same RED line from both.
- parity resolve: `resolve triage` (via `it.each(PRODUCT_STAGES)`) → copy picks what the checker picks.
- model-config: `{default, triage}` → `valid`; `resolveStageModel(…, 'triage')` → its own entry.
- model-config-format: `resolvedStageLines` lists `triage` between `grill` and `build`, `(default)`
  when absent; no `(default)` mark when every stage incl. `triage` has an entry.
- status: MODELS note contains `triage           sonnet · high  (default)`.

## Guarantee audit (P0)

- "a `models.stages.triage` key is accepted" → floor: enum membership (`PRODUCT_STAGES`), held equal
  to pharn-oss's checker by the parity test (sha256-pinned vendored copy + extracted set).
- "the copy matches pharn-oss's checker" → floor for the pinned commit only; the copy can lag live
  upstream until the next refresh — the existing named residual, unchanged.
- "`/pharn-triage` runs in a full `/pharn-loop`" (docs) → pharn-oss's behaviour, not this CLI's;
  described as upstream's, cited by version (7.7.0), no guarantee claimed by the CLI.

## Trust audit (P2)

- The two vendored `.mjs` files are test fixtures, executed only by the test suite (as today's
  checker already is); never shipped, never run by the CLI. Byte pins catch an edit.
- No new runtime input; the `models` block keeps riding the config verbatim, and the stage name
  reaches terminals only through the existing `terminalSafe` paths.

## Determinism audit (P5)

- The only branch touched is `includes(name)` over a closed list — a membership test.

## Out of scope (named, not done)

- The vendored `tests/fixtures/pharn-oss/validate.mjs` is also stale (upstream now imports
  `frontmatter-core.mjs` and `capability-files-core.mjs`); refreshing it is a separate increment
  (follow-up), not needed for `triage`.

## Open questions (HALT)

- None open. Version: 0.18.1 (patch, `### Fixed`) — chosen by the maintainer at GATE 1, 2026-11-11.

## Approval

- Approved as written by the maintainer at GATE 1, 2026-11-11.
