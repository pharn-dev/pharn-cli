# SHIP — release-on-merge (gated `/pharn-dev-ship`, advisory roll-up)

## Stages run, in order

1. `/pharn-dev-plan` → `.dev/features/release-on-merge/PLAN.md` — **GATE 1**: approved as written (2026-10-12; `workflow_dispatch` kept, npm-before-tag, PR-time consistency test added).
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 8 concerns, 0 blocking-severity, 2 important — both addressed inside the plan's `## Files` by executing the committed steps in tests).
3. `/pharn-dev-build` → floor: `npm run check` GREEN; `node .dev/floor/validate.mjs .` exit **0**.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`** (base `6c04a7f`; outside gates `tests` 0→0, `validate` 0→0).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`** (`test`, `validate`, `lint`, `format:check`, `lint:md`, `typecheck`, `floor-tests` all 0; verifiers registered: 0).
6. `/pharn-dev-review` → `REVIEW.md` (pointer only — findings not restated here).

## Where the run ended

**GATE 2** — the post-review decision (merge / fix / abandon) is the human's. Nothing was committed, pushed, merged or sealed; the increment sits uncommitted on branch `feat/release-on-merge`.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
