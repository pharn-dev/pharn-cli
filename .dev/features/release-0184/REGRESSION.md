# REGRESSION — release-0184

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `6ca4634b45e243efac4ffed9221c71ddea1d09e5` (`HEAD`, `origin/main` after #357 and #358;
  the build is an uncommitted working tree on top of it, so `base = HEAD`).
- **inside:** the 4 paths `git diff --name-only HEAD` reports (`regression-report.json` `.inside`),
  each declared in `PLAN.md` `## Files`. `.pharn/` is ignored since #358 and not in the diff.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files + whole-repo `validate`; 0
  committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config.
- **environment:** as in 0.18.3, the worktree-isolated session cannot `git worktree add` another
  path, so the base ran in a `git archive` export of the base SHA in the session scratchpad. Both
  sides ran the same script with the proxy variables unset and loaded all 46 test files.

## Per-gate exit codes

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

- `regressions[]`: none
- `pre_existing[]`: none

## Verdict

REGRESSIONS: none — no deterministically-detectable breakage outside the feature
(`check-regress.mjs verdict` exit 0, `"verdict": "no-regressions"`).

This catches exactly what the outside suite catches, nothing more: a regression no deterministic
check covers is invisible to it. The vitest suite (`npm run check`, 108 files) ran GREEN at build.
