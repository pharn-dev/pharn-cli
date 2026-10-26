# REGRESSION — default-channel-latest

Verdict (floor, `node .dev/floor/check-regress.mjs verdict`, verbatim in `regression-report.json`): **no-regressions**.

- base: `33d0ec9` (working tree dirty at regress time → `base = HEAD`, which is `origin/main`); head: the working tree after the review's fixes (re-run; same result as the first run).
- scope: `check-regress.mjs scope` exit 0 against `PLAN.md` `## Files` (35 changed product paths inside after the review fixes; the
  stage's own artifacts under `.dev/features/default-channel-latest/` and `.pharn/` scratch left out, as in
  earlier increments).
- outside gates, run identically at base (fresh detached worktree) and head:

| gate | base | head |
| --- | --- | --- |
| `tests` (46 `node --test` files outside the feature) | 0 | 0 |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 | 0 |

- style gates skipped by the rule: no shared style config was touched.
- regressions: none. pre-existing failures: none.
- note: a first attempt recorded `tests` 1 → 1 because zsh did not split the file list (`node --test`
  received one argument); re-run with `${=OT}` — the numbers above are from the corrected run.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature. This certifies only the
base/head comparison of the gates above; the feature's own tests are `/pharn-dev-verify`'s.
