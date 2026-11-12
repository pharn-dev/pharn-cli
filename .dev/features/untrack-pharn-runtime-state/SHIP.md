# SHIP — untrack-pharn-runtime-state

`/pharn-dev-ship` roll-up (gated mode, advisory). The decision is the human's.

## Stages run, in order

1. `/pharn-dev-plan` → `PLAN.md`. **GATE 1:** the maintainer approved it as written.
2. `/pharn-dev-grill` → `GRILL.md` (advisory): 4 concerns, 0 blocking-severity.
3. `/pharn-dev-build` → `.gitignore` block, eight `git rm --cached` index removals,
   `tests/repo-runtime-state.test.ts`. The test failed before the change (10/11) and passed after
   (11/11); prettier reformatted the test once (build step 2b).
4. `/pharn-dev-regress` → `REGRESSION.md`, `regression-report.json`.
5. `/pharn-dev-verify` → `VERIFY.md`, `verify-report.json`.
6. `/pharn-dev-review` → `REVIEW.md`.

The run ended at **GATE 2**.

## Structural verdicts (verbatim)

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` exit **0**
  (108 test files, 3527 passed, 1 skipped).
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`"no-regressions"`**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`"PASS"`**, `failing_gates: []`.

## Pointers

- Findings: `REVIEW.md` (verdict GREEN, 0 floor findings, 3 advisory) and `GRILL.md` (advisory).
  Not restated here.

## Run notes

- Every Write in this worktree was first denied: the PreToolUse hooks run with cwd = the main
  checkout and read its tracked, stale `.pharn/writes-scope.json`. The maintainer temporarily set the
  main checkout's scope file to `.claude/worktrees/relaxed-feistel-fd3ad9/**`; it must be restored in
  the main checkout after this run. This increment does not fix that cwd mismatch (REVIEW.md,
  important advisory finding).
- The regress baseline ran in a `git archive` export of `f83b736a`, as in supervise-stage. The
  feature's own `.dev/features/untrack-pharn-runtime-state/*` artifacts were left out of `--changed`
  (REVIEW.md, minor finding and proposed lesson).
- The working copies of the eight untracked files stay on disk in this worktree, and now match the
  new ignore block.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
