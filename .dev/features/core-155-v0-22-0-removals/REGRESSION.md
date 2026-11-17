# REGRESSION — core-155-v0-22-0-removals

- Base: origin/main 228b73e0 (after #404 and #405), exported with `git archive` into a scratch dir,
  node_modules linked. Head: this branch rebased onto it.
- Gates at base and HEAD: format:check, lint, lint:md, validate, tests (the whole suite) and
  vitest:outside (the whole suite minus `tests/repo-runtime-state.test.ts`).
- Verdict (`.dev/floor/check-regress.mjs verdict`, verbatim): **no-regressions**. `tests` is
  `pre_existing` at the base only because the export is not a git repository and
  `tests/repo-runtime-state.test.ts` shells out to git there (11 failures, all in that file); with that
  file left out the base suite passes (104 files, 3582 passed), and HEAD passes the whole suite
  (105 files, 3595 passed). Machine report: `regression-report.json`.
- Scope: the suite catches exactly what it tests; behaviour no test covers is not judged here.
