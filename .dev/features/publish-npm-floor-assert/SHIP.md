# SHIP — publish-npm-floor-assert

Chain: `/pharn-dev-plan` → **[human approved]** → `/pharn-dev-grill` → `/pharn-dev-build` →
`/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`. Ran in order; ended at **GATE 2**
(post-review human decision), not at a RED-verdict STOP.

## Stages and where the run ended

| # | stage | outcome |
| - | ----- | ------- |
| 1 | `/pharn-dev-plan` | **GATE 1** — halted; human approved. Two questions answered: compare ships **inline**; the floor-gate extension **built in this PR** (whitelist widened 2 → 4 files, recorded in `PLAN.md`) |
| 2 | `/pharn-dev-grill` | advisory; **gates nothing**. 8 concerns (0 blocking, 3 important, 5 minor) — `GRILL.md` |
| 3 | `/pharn-dev-build` | floor GREEN → proceed |
| 4 | `/pharn-dev-regress` | `no-regressions` → proceed |
| 5 | `/pharn-dev-verify` | `PASS` → proceed |
| 6 | `/pharn-dev-review` | advisory; **GATE 2** — presented to the human |

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` **exit `0`** (`FLOOR: GREEN`). Supporting: `npm run check` clean (prettier, eslint, tsc ×2, 625 vitest).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (helper exit 0). `regressions: []`, `pre_existing: []`. Base `e08eb18c16ce260bb5039d039dcb9c56397d1a9e`; outside gates `tests 0→0`, `validate 0→0` over 45 files / 704 assertions. Scope partition returned **`escaped: []`**.
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (helper exit 0), `failing_gates: []`, over 8 gates: `test`, `floor-tests`, `validate`, `lint`, `format:check`, `lint:md`, `check-run-pins`, `check-action-pins` — all `0`. `verifiers: {registered: 0, findings: []}` (advisory, and structurally not a verdict input).

## Pointers (cited, not restated — P4)

- `.dev/features/publish-npm-floor-assert/PLAN.md` — the approved intent, incl. the literal diff and the recorded scope decision
- `.dev/features/publish-npm-floor-assert/GRILL.md` — advisory, gates nothing
- `.dev/features/publish-npm-floor-assert/REGRESSION.md` / `regression-report.json`
- `.dev/features/publish-npm-floor-assert/VERIFY.md` / `verify-report.json`
- `.dev/features/publish-npm-floor-assert/REVIEW.md` — **GREEN, 0 blocking; 5 advisory findings**

## Two corrections this run made to its own reasoning (recorded, not buried)

1. **The grill disproved a plan claim by execution.** `PLAN.md` credited `set -euo pipefail` with aborting on a failing `npm --version`; a command substitution used as an *argument* does not trip `set -e`. The shipped step now rests its fail-closed property on the **parse** and says so in a comment. `PLAN.md` itself still carries the original sentence — it was outside the build's writes-scope, and the floor correctly refused to let it be edited mid-build.
2. **The regress baseline was initially wrong for orchestration reasons.** The first capture reported `tests: 1`; the cause was zsh not word-splitting an unquoted expansion, passing 45 paths as one filename. Re-run correctly, base and head are both `0`. A silently-accepted `1` would have written a false `pre_existing` entry.

## Post-GATE-2 fix round (human said "fix everything")

Three of the review's five advisory findings were repaired, and every verdict above was **re-computed
against the fixed code** — the numbers in this file are the final ones:

- `publish.yml`'s comment no longer overclaims: the gate sentence now scopes itself to the **package-manager half** and names R1's exclusion of curl-and-execute.
- **Residual R5 closed.** `check-run-pins.test.mjs` now asserts the `Assert npm floor` step and its `11.5.1` comparison are present in the committed `publish.yml`, so deletion is caught, not just reversion. Proven to fail against a copy with the step removed.
- `PLAN.md`'s determinism audit carries an explicit **CORRECTED** note retiring the false `set -e` claim.
- Two findings were assessed and deliberately kept (the positive control reading a trusted file; the test file's subprocess coupling to the sibling gate) — both are backstops for named residuals.

**Not fixed, by the constitution's own instruction:** `.dev/floor/README.md` says *"The floor is three
files"* while the directory holds 40+ checkers — a P4 doc-contradicts-code condition. `CONSTITUTION.md`
states the agent **MUST NOT auto-fix a constitution violation**; it is flagged for human review. It is
pre-existing (last touched in #15) and outside this increment's `## Files`.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.**

`/pharn-dev-ship` did not merge, push, commit, or apply any seal.
