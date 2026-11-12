# PLAN — supervise-stage (accept pharn-oss 7.9.0's `supervise` product stage in the `models` block)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: port pharn-oss 7.9.0's new product stage `supervise` into `src/lib/model-config.ts`
  (`PRODUCT_STAGES`, after `triage`), refresh the vendored checker the parity test runs, update the
  stage-enumerating tests and user docs, and release it as 0.18.3. Template: `triage-stage`
  (0.18.1, 649f586).
- layer(s): the CLI itself (`src/lib`), tests + vendored test fixture, user docs, release metadata
- constitution_refs: [P0, P1, P2, P3, P4, P7]

## Why (P7 — a real need, verified this run)

- pharn-oss `main` @ `5568d4ce` (SKILLS_VERSION 7.10.2; read this run through the GitHub API;
  `v7.10.2` is its latest verified release per `gh release list`). Its checker
  `pharn/floor/check-model-config.mjs` last changed in `7c5c51b8` ("a supervisor decides an
  escalated full loop (7.9.0)") and has `supervise: "pharn-supervise.md"` between `triage` and
  `build` in `PRODUCT_STAGES`. Smoke-run this run on that file: `validate` over
  `{default, supervise:{opus,high}}` → GREEN, exit 0; `resolve supervise` →
  `{"model":"opus","effort":"high"}`; a `supervise` model `"gpt-4"` → RED
  `stage "supervise" model "gpt-4" is not an alias …`, exit 1.
- pharn-cli 0.18.2's copy (`src/lib/model-config.ts:40-53`) lacks `supervise`, so
  `checkModelsBlock` REDs `stage "supervise" is not a product stage`: `pharn status` reports such a
  block as rejected, and `init`/`update` would not apply such a block from pharn-oss (LIMITS.md §3e,
  "named, never fatal"). pharn-oss 7.9.0's release notes name "a pharn-cli port that accepts the
  key" as a follow-up — this increment.
- **`MIN_CLI` needs no change.** pharn-oss's shipped root `pharn.config.json` `models.stages` (read
  this run) names default, spec, plan, grill, build, regress, verify, ship, loop, review,
  memory-promote, ac-test — no `supervise` key — so the stage resolves through `default` and no
  released CLI rejects pharn-oss's own block; `MIN_CLI` stays `0.14.0` (docs/contributing.md refresh
  step 4 does not fire). If pharn-oss later ships a `supervise` key in its block, it must first
  raise `MIN_CLI` to the CLI that carries this change (0.18.3).

## Discovery — verified this run (P6)

- Consumers of `PRODUCT_STAGES` in `src/`: unchanged since triage-stage — `model-config.ts`
  (validator) and `model-config-format.ts` `resolveStageRows` (status/init MODELS notes,
  `status --json`). Both pick up the new member with no code change.
- `diff` of the vendored checker (pinned `aa437fd8…`, pharn-oss `3afbb125`) against `5568d4ce`'s:
  the one added line `supervise: "pharn-supervise.md",` plus four comment rewordings ("the twelve" →
  open phrasing). `validateStages` / `resolveStage` logic and RED wording are unchanged.
- `frontmatter-core.mjs` at `5568d4ce` is byte-identical to the vendored file (sha256
  `e883dbe7…`, its existing pin), so it is NOT re-vendored.
- New checker sha256: `6fbc74044bb81bfb7899e40709da926efd7cea743a472b59920c19b4ea04ba96`.
- Sweep for `supervise` in `src`, `tests`, `docs`, `README.md`, `CHANGELOG.md`: zero hits — no test
  uses `supervise` as its unknown-stage example (the triage port switched those to `deploy`), so no
  stand-in swaps are needed.
- Stage lists to update: `docs/reference/pharn-config.md:238` (stage-names row) + its `triage`
  paragraph (245-249); `tests/model-config-format.test.ts` (two lists, lines 34 and 53);
  `tests/status.test.ts:791`.
- Upstream behaviour the docs cite (pharn-oss release notes, read this run): 7.8.0 — a `replan`
  triage verdict starts up to two re-plan rounds; 7.9.0 — a `spec` verdict, or a `replan` still
  standing after the last round, goes to the routed stage `/pharn-supervise`, which decides
  `proceed-at-risk` (the escalated findings carried as known risk) or `stop`; 7.10.0 — a third
  decision, `amend-spec`, once per run. So README.md:269-270 and docs/getting-started.md:126 ("any
  verdict but proceed stops the run for you") are stale since 7.8.0 and are rewritten.
- `gh release list`: `v0.18.2` is tagged (2026-11-11) → add to `KNOWN_TAGS` (docs/RELEASING.md
  step 2; the 0.18.2 bump added `v0.18.1`).

## Files

- `src/lib/model-config.ts` — add `'supervise'` after `'triage'` in `PRODUCT_STAGES` — layer: CLI lib
- `tests/fixtures/pharn-oss/check-model-config.mjs` — replaced byte-for-byte from pharn-oss
  `main` @ `5568d4ce` — layer: vendored test fixture
- `tests/model-config-parity.test.ts` — re-pin `PINNED_SHA256` + the commit / SKILLS_VERSION /
  last-changed comment; the `frontmatter-core.mjs` comment says it is unchanged at that commit; add
  two corpus blocks with a `supervise` entry (valid; bad model) — layer: tests
- `tests/model-config-format.test.ts` — add the `supervise` row to both enumerated lists — layer: tests
- `tests/model-config.test.ts` — one direct case: a `supervise` key is `valid`, resolves to its own
  entry, and sits right after `triage` — layer: tests
- `tests/status.test.ts` — assert the MODELS note shows a `supervise` row resolved through default
  — layer: tests
- `tests/release-consistency.test.ts` — add `v0.18.2` to `KNOWN_TAGS` — layer: tests
- `docs/reference/pharn-config.md` — add `supervise` to the stage-names row; extend the `triage`
  paragraph: `supervise` is `/pharn-supervise`'s stage (pharn-oss 7.9.0), not named in pharn-oss's
  block (resolves through `default`), and pharn before 0.18.3 refuses a block naming it — layer: docs
- `docs/getting-started.md` — replace "any verdict but proceed stops the run for you" with
  upstream's current behaviour: re-plan rounds (7.8.0), and on escalation `/pharn-supervise`
  decides `proceed-at-risk` or `stop` (7.9.0), or since 7.10.0 `amend-spec` — layer: docs
- `README.md` — the same sentence in the `/pharn-loop` paragraph — layer: docs
- `CHANGELOG.md` — `## [0.18.3] — 2026-11-12` / `### Fixed` entry + compare links — layer: release
- `package.json`, `package-lock.json` — `npm version --no-git-tag-version 0.18.3` — layer: release

## Contracts satisfied

- `pharn-contracts` — none touched. The `models` schema is pharn-oss's; this is the refresh
  procedure in `docs/contributing.md` ("pharn-oss's `models` rules — a pinned copy"), steps 1–4.

## Evals to write (P1)

- parity: `PRODUCT_STAGES` keys equal the vendored checker's, in order → passes only with
  `supervise` after `triage` (fails against the refreshed fixture until the source change lands).
- parity: vendored checker matches its new sha256 pin; `frontmatter-core.mjs` still matches its pin.
- parity corpus: block with a valid `supervise` entry → checker GREEN = copy `valid`; `supervise`
  model `"gpt-4"` → the same RED line from both.
- parity resolve: `resolve supervise` (via the existing `it.each(PRODUCT_STAGES)`) → copy = checker.
- model-config: `{default, supervise}` → `valid`; `resolveStageModel(…, 'supervise')` → its entry;
  index of `supervise` = index of `triage` + 1.
- model-config-format: `resolvedStageLines` lists `supervise` between `triage` and `build`,
  `(default)` when absent; no `(default)` mark when every stage incl. `supervise` has an entry.
- status: MODELS note contains `supervise        sonnet · high  (default)`.
- release-consistency: the compare-link chain resolves `v0.18.2` as a known tag.

## Guarantee audit (P0)

- "a `models.stages.supervise` key is accepted" → floor: enum membership (`PRODUCT_STAGES`), held
  equal to pharn-oss's checker by the parity test (sha256-pinned vendored copy + extracted set).
- "the copy matches pharn-oss's checker" → floor for the pinned commit only; the copy can lag live
  upstream until the next refresh — the existing named residual, unchanged.
- "a full `/pharn-loop` may run `/pharn-supervise` when the grill escalates" (docs) → pharn-oss's
  behaviour, not this CLI's; described as upstream's, cited by version (7.8.0 / 7.9.0 / 7.10.0), no
  guarantee claimed by the CLI.

## Trust audit (P2)

- The refreshed vendored `.mjs` is a test fixture, executed only by the test suite (as today);
  never shipped, never run by the CLI. The byte pin catches an edit.
- No new runtime input; the `models` block keeps riding the config verbatim, and the stage name
  reaches terminals only through the existing `terminalSafe` paths.

## Determinism audit (P5)

- The only branch touched is `includes(name)` over a closed list — a membership test.

## Out of scope (named, not done)

- `.pharn/writes-scope.json` is tracked in git; this run's scope changes are restored before commit,
  and untracking it is a separate follow-up.

## Open questions (HALT)

- None open. Version 0.18.3 (patch, `### Fixed`) — given by the task, confirmed at GATE 1.

## Approval

- Approved as written by the maintainer at GATE 1, 2026-11-12.
