# REGRESSION — hook-session-cwd

- base: `f83b736a98867eed28c12f6d164189627e4be0e1` (working-tree build → `base = HEAD`)
- machine report: `.dev/features/hook-session-cwd/regression-report.json` (`check-regress.mjs verdict`, verbatim)

Re-run after the GATE-2 fix (the hooks fall back to the process cwd when `session-root.cjs` cannot be
loaded or throws). The numbers below are from that re-run.

## Partition

- inside (16): the eight `.claude/hooks/` files in the PLAN's `## Files`, plus the eight
  `.dev/features/hook-session-cwd/` artifacts (PLAN, GRILL, REGRESSION, regression-report, VERIFY,
  verify-report, REVIEW, SHIP).
- declared writes: the PLAN's `## Files` paths, plus the seven stage artifacts other than PLAN.md — each
  is its stage's own declared `writes:` (`.claude/commands/pharn-dev-{grill,regress,verify,review,ship}.md`),
  written under that stage's scope, not by the build. Without them, `check-regress.mjs scope` exits 1
  naming them as escaped; they are added here, by name, rather than left out of `--changed`.
- `.pharn/writes-scope.json` (tracked on this base until pharn-dev/pharn-cli#358 lands, rewritten by every
  stage's setter) was restored with `git checkout` before the partition and is not part of the increment.
- outside gates: `tests` = `node --test` over the 43 tracked `*.test.mjs` / `*.test.cjs` files outside the
  inside set (all under `.dev/floor/`); `validate` = `node .dev/floor/validate.mjs .`; no committed eval
  pairs; style gates skipped (no shared style config inside).

## Gates

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

- regressions: none
- pre_existing: none

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

This compares exit codes of the existing suite at the base and at HEAD; it catches what that suite
catches, nothing more.
