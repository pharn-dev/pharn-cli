# SHIP — capability-picker (gated /pharn-dev-ship roll-up)

Advisory roll-up of the gated build loop for the increment **"interactive capability picker for bare `pharn add` / `pharn remove`."** `/pharn-dev-ship` added no floor primitive — every verdict below belongs to a sub-stage. This file is not an approval, a "shipped", or a `PHARN ✓ reviewed` seal.

## Stages run, in order

| # | stage             | outcome                                                      |
| - | ----------------- | ----------------------------------------------------------- |
| 1 | `/pharn-dev-plan`    | PLAN.md written → **GATE 1** approved by the human ("approve as written"; Q1 = summary-line rendering, Q2 = extract `deleteCapabilityDir`) |
| 2 | `/pharn-dev-grill`   | GRILL.md — 5 advisory concerns (0 blocking); F1 (add config-threading) carried into the build. Gates nothing; proceeded |
| 3 | `/pharn-dev-build`   | 11 files written + tests; floor GREEN                       |
| 4 | `/pharn-dev-regress` | regression-report.json — no pass→fail flip outside the feature |
| 5 | `/pharn-dev-verify`  | verify-report.json — all floor gates green                  |
| 6 | `/pharn-dev-review`  | REVIEW.md — GREEN, 0 blocking, 4 advisory findings          |

**Run ended at GATE 2** (post-review human decision) — not at a RED-verdict STOP.

## Structural verdicts read, verbatim (the floor — the only guarantees)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **`0`** (GREEN). Measured on a clean detached HEAD worktree; the live working-tree RED is provably 100% gitignored `test-*/` fixtures (none of the increment's files), and `npm run check` was independently GREEN (414 vitest tests).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (base `a8131a2`; gates `tests` 0→0, `validate` 0→0).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`test` / `validate` / `lint` / `format:check` / `lint:md` all 0; 0 verifiers registered → floor gates only).

## Advisory artifacts (pointers — cite, not restated, P4)

- Review: `.dev/features/capability-picker/REVIEW.md` (GREEN; 4 advisory findings — a P3 co-location call, a duplicated `plural` helper, an untested add cancel/defensive branch, an N-parse/N-write efficiency tradeoff; + a proposed lessons-learned candidate on the gitignored-fixture floor artifact).
- Grill: `.dev/features/capability-picker/GRILL.md` (advisory; F1 resolved by the final-config threading test).

## Standing decision is the human's

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is good or wise; that is the human's call at the post-review gate (merge / fix / abandon). `/pharn-dev-ship` does not merge, push, or seal.
