# REGRESSION — triage-stage

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `30ed793cbcbdb07f7bba463865e5ce61e6996959` (`HEAD`; the build is an uncommitted working
  tree on top of it, so `git status --porcelain` is non-empty → `base = HEAD`).
- **inside:** the 20 paths `git diff --name-only HEAD` + untracked-new files report (full list in
  `regression-report.json` `.inside`), each declared in `PLAN.md` `## Files`. `.pharn/` (hook scratch)
  and this feature's own stage artifacts are not build output.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned + whole-repo
  `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config, so `lint` / `format:check` /
  `lint:md` are absent from both maps.
- **environment:** the base ran in a fresh `git worktree add --detach` of the base SHA (removed
  after); both sides ran with the proxy variables unset. A first attempt recorded `tests: 1` on both
  sides because macOS bash 3.2 lacks `mapfile` (the list never loaded); it was discarded and both
  sides re-run with a `read` loop that loaded all 46 files.

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
check covers is invisible to it. The vitest suite (`npm run check`, 107 files) ran GREEN at build.
