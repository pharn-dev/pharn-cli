# PLAN — make `CONTRIBUTING.md` match the six CI gates, and make one local command equal CI

- spec_content_hash: 8c7e7bd8c3cf3115f420a1edee19518694b4c19c0bd6a519686eef085333f9e1 # fix #4
- increment: `CONTRIBUTING.md` tells contributors four commands are "exactly what CI runs". CI runs six, and the two omitted (`Markdown lint`, `Build`) are REQUIRED ruleset contexts — so a docs-only PR can pass everything the file documents and still land a red required X with no documented way to reproduce it locally. List all six, add `lint:md` to `npm run check` so one local command actually covers what CI checks, and strip the module-era prose the file still carries.
- layer(s): `package.json`, `tests`, `docs`
- constitution_refs: [P0, P3, P4, P7]

## Discovery (P6 — read live this run)

- `CONTRIBUTING.md:26-27` — "all four must pass (this is exactly what CI runs)":
  `format:check` · `lint` · `typecheck` · `npm test`.
- `package.json:48` — `"check": "npm run format:check && npm run lint && npm run typecheck && npm run test"`.
  Prettier's globs are `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`; eslint covers `src tests scripts`.
  **Nothing in those four gates reads a markdown file.**
- `docs/contributing.md:39-45` already lists all six with their job-name annotations — correct, and the
  wording to mirror. `:52` states `check`'s composition; `:54` names the three extra required contexts
  (`floor`, `gitleaks`, CodeQL).
- `CLAUDE.md:24` — "aggregate; excludes lint:md". `README.md:135` — same composition inline.
- Module-era prose still in `CONTRIBUTING.md`: `:3` "fetches PHARN **modules**"; `:9` "the init step
  pipeline, dependency resolution"; `:30` "when changing **wizard** behavior". All three name deleted
  subsystems (`CLAUDE.md` → "Module model (removed)").
- `docs/contributing.md:77` already uses the live phrasing: "the archetype install flow, capability
  resolution, and the security-sensitive libs" — reuse it verbatim at `CONTRIBUTING.md:9` (P4).
- `tests/ci-workflow.test.ts:19-26` holds `EXPECTED_GATES` (six name→script pairs) and asserts set
  equality over the workflow's jobs. `tests/dev-script.test.ts` (landed last increment) holds a second
  copy of the gate-script list.
- **Adjacent staleness the spec permits folding in:** `README.md:136` and `docs/contributing.md:18` say
  `build:install-local` links into `test-app/`; `scripts/install-local.mjs:24` filters
  `startsWith('test-')` — every local `test-*/`.

## The decision this plan makes

Take the spec's **optional item 3** — `npm run check` gains `lint:md`. Listing six commands in
`CONTRIBUTING.md` documents the gap; it does not close it. The reported failure is a contributor who
runs the documented gates green and still gets a red required check, and the only fix for that is a
local aggregate that covers markdown. Knock-on, intended and stated: `prepublishOnly` is
`npm run check` (`package.json:49`), so publishing now also requires markdownlint-clean docs.

## Files

- `tests/check-composition.test.ts` — NEW: pin that `check` runs all six CI gate scripts (modulo
  `test` vs `test:coverage`, which is deliberate — see the eval note) — layer `tests`
- `package.json` — `check` gains `&& npm run lint:md` — layer `build`
- `CONTRIBUTING.md` — `:26-27` six gates; `:3`, `:9`, `:30` de-module-ised — layer `docs`
- `CLAUDE.md:24` — drop "excludes lint:md" — layer `docs`
- `README.md:135` — composition; `:136` `test-*/` wording — layer `docs`
- `docs/contributing.md:52` — composition; `:18` `test-*/` wording — layer `docs`
- `CHANGELOG.md` — contributor-facing — layer `docs`

**Not touched:** `.github/workflows/ci.yml` (the ruleset lives on github.com and cannot be updated
from this PR), and `tests/ci-workflow.test.ts` (its gate set stays six; adding `floor`/`gitleaks`/
CodeQL to it is `5.6d`).

## Evals to write (P1)

- `scripts.check` contains `format:check`, `lint`, `lint:md`, `typecheck`, and a test script.
- The pin is written as a **set relation against the CI gate list**, not a string compare, so it keeps
  meaning if the order changes.
- **`check` runs `test`, CI runs `test:coverage`** — the one deliberate divergence. Pin it explicitly
  with a comment, so the difference is a recorded decision rather than a hole the test failed to see.
- `check` does NOT contain `build` — also deliberate: `build` is a CI gate but a slow local one, and
  `prepack` already runs it before publish. Pin the exclusion so it stays a decision.

## Guarantee audit (P0)

- "`npm run check` now covers what CI checks" → **PARTIAL, and the test says which part.** It covers
  five of six gate *scripts*; `build` is excluded on purpose and `test` stands in for `test:coverage`
  (same suite, no coverage thresholds). Claiming "check == CI" would be false — the docs will say
  "everything except `build`, and without coverage thresholds".
- "`CONTRIBUTING.md` matches CI" → **ADVISORY.** No gate reads `CONTRIBUTING.md`. Prose review only.
- "the six job names still match the ruleset" → **NOT TOUCHED, and half-advisory anyway**:
  `tests/ci-workflow.test.ts` pins the workflow side; it cannot see the ruleset.

## Trust audit (P2)

`package.json` is repo-owned; parsed with `JSON.parse` as the two sibling script pins already do.

## Determinism audit (P5)

Substring/membership tests over a parsed JSON object.

## Out of scope (P7)

- Editing `ci.yml`, renaming a job, adding or removing a gate.
- Adding `floor` / `gitleaks` / `Analyze (javascript-typescript)` to `tests/ci-workflow.test.ts` — `5.6d`.
- `docs/reference/pharn-config.md` overwrite rows — `5.5c`.
- Changing `scripts/install-local.mjs` (only the prose describing it).

## Open questions (HALT)

- None.
