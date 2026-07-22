# SHIP — canonical-npm-name (advisory roll-up)

Increment: rename the npm package `@pharn-dev/pharn` → `pharn` (canonical unscoped name), no version
bump, no behavior change. Run via `/pharn-dev-ship` (gated mode).

## Stages that ran, in order, and where the run ended

`plan → grill → build → regress → verify → review` — all ran. **The run ends here, at GATE 2** (the
post-review human decision: merge / fix / abandon). `/pharn-dev-ship` does not merge, push, or seal.

## Structural verdicts read (verbatim)

| Stage | Verdict source | Value |
| --- | --- | --- |
| plan | human approval halt (GATE 1) | **Approved** (2026-07-22), with OQ1/OQ2/OQ3 resolved |
| grill | advisory (gates nothing) | 2 concerns, 0 blocking (2 minor/advisory) |
| build | `npm run check` (build skill's floor) | **GREEN** (format ✓ lint ✓ typecheck ✓ 378 tests ✓) |
| build | `.dev/floor/validate.mjs .` exit (ship orchestrator's build-verdict read) | **1** — pre-existing `test-*/` contamination; human authorized continue |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** (exit 0) |
| verify | `verify-report.json` `.verdict` | **`FAIL`** — `failing_gates: ["validate"]` only |
| review | advisory (no structural verdict) | **GREEN (advisory)**, no findings — see `REVIEW.md` |

## The single standing failure, characterized honestly

Every failing signal in this run is the **one** pre-existing condition: `node .dev/floor/validate.mjs .`
walks the **gitignored `test-*/` install dirs** and flags 15 deliberately-red test fixtures there. This:

- is **not** caused by the rename — `/pharn-dev-regress` proved it deterministically (`validate` RED at the
  HEAD baseline **and** at HEAD → `pre_existing`, not a regression);
- leaves **every rename-relevant gate GREEN** — build `npm run check` (incl. vitest over `src/`), and
  verify's `test` / `lint` / `format:check` / `lint:md` all exit 0;
- is a repo-tooling granularity limit (the floor tooling does not exclude the local install fixtures),
  surfaced for the human, not a defect in the increment. See `REVIEW.md` "Proposed lessons".

## Pointers (cited, not restated — P4)

- `REVIEW.md` — 4 advisory lenses, GREEN, no findings; 2 proposed dev-loop lessons.
- `GRILL.md` — advisory, 2 minor concerns (untested copy string; "identical to scoped publish" is a
  reasoning claim, not a fetched-tarball diff).
- `VERIFY.md` / `verify-report.json`, `REGRESSION.md` / `regression-report.json` — the floor verdicts above.

## Standing decision is the human's

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** Note: all npm-side actions (publish,
deprecating `@pharn-dev/pharn`, Trusted Publisher config) are the human's, post-merge, per the increment's
intent. The working tree holds exactly the 10-file rename diff (+ these pipeline artifacts under
`.dev/features/canonical-npm-name/`); nothing is committed or pushed.
