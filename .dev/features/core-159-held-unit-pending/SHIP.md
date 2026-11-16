# SHIP — core-159-held-unit-pending (Linear CORE-159, C1.2)

Worktree `.claude/worktrees/agent-af21d1a8b7e8ad05c`, branch `przemek/core-159-c12-a-held-executable-unit-no-longer-locks`, off origin/main `991b229`. Commits: `79abf0d` code/tests/docs, `3282e6f` add.md wording, then the GATE 2 doc fix and these artifacts.

## Stages run, in order

1. `/pharn-dev-plan` → [PLAN.md](PLAN.md). GATE 1: approved by the orchestrator. Q1: invert the two extra assertions too. Q2: `missing` = held ∧ `restored` ∧ recorded (no store → every held `restored`). Q3: the recommended `add` wording. `pharn-config.md` is in scope.
2. `/pharn-dev-grill` → [GRILL.md](GRILL.md), advisory: 5 concerns (0 blocking, 2 important, 3 minor). All were applied in the build: one note wording true in both store cases, the stamp asserted after `add`, the unit asserted untouched by `add`, and the comment wording.
3. `/pharn-dev-build`. The new tests were written first and ran RED (14 failing). Then the pending rule (`USER_EDIT_SKIPS` or `held`), `UnitHold.missing`, the note block, the report projection, the `add` refusal wording, the comments, the docs, CLAUDE.md and the CHANGELOG. `npm run check` GREEN.
4. `/pharn-dev-regress` → [regression-report.json](regression-report.json), [REGRESSION.md](REGRESSION.md).
5. `/pharn-dev-verify` → [verify-report.json](verify-report.json), [VERIFY.md](VERIFY.md).
6. `/pharn-dev-review` → [REVIEW.md](REVIEW.md), advisory: 0 floor findings, 4 advisory (1 fixed during review: the `add.md` wording, commit `3282e6f`).

Ended at: GATE 2 (the human decision).

## Human decisions

- GATE 2 (orchestrator): deliver after one fix — `update.md`'s deleted-hook sentence made precise (the entry stays wired to a missing script, the guard does not run until the hold ends, `pharn status` reports it). Open the PR; do not merge.

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` exit **0**.
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`no-regressions`**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`PASS`** (`failing_gates: []`).

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.

Rebased onto origin/main eba709d (CORE-160/161/162) on 2026-11-16; added the held-run × changesNothing test and its update.md sentence.
