# REGRESSION — root-footprint-consolidation

Verdict (floor, `node .dev/floor/check-regress.mjs verdict`, verbatim in `regression-report.json`): **no-regressions**.

- base: `4b6a42a` (`git merge-base HEAD origin/main`); head: the review-fix commit (re-run after the review's fixes; same result).
- scope: `check-regress.mjs scope` exit 0 against the RE-APPROVED `PLAN.md` `## Files` (the first run exited 1;
  see `SHIP.md`). The changed set is the build's product changes; the stage's own artifacts under
  `.dev/features/root-footprint-consolidation/` and `.pharn/` scratch are left out, as in earlier increments
  (e.g. `remove-preserve-user-files/regression-report.json` `inside`).
- outside gates, run identically in fresh detached worktrees at base and head (no gitignored `test-*/` trees):
  `tests` (46 `node --test` files outside the feature) 0 → 0; `validate` (`node .dev/floor/validate.mjs .`) 0 → 0.
- style gates skipped by the rule: no shared style config was touched.
