# REGRESSION — supervise-stage

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `b14cf221fcc1d9818c4ce8e0b4a9ab13b2a129f7` (`HEAD`; the build is an uncommitted working
  tree on top of it, so `git status --porcelain` is non-empty → `base = HEAD`).
- **inside:** the 13 paths `git diff --name-only HEAD` reports (full list in
  `regression-report.json` `.inside`), each declared in `PLAN.md` `## Files`. `.pharn/` (hook scratch)
  and this feature's own stage artifacts are not build output.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned + whole-repo
  `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config, so `lint` / `format:check` /
  `lint:md` are absent from both maps.
- **environment:** this session is isolated in its worktree, which refuses `git worktree add` on
  another path, so the base ran in a `git archive` export of the base SHA extracted into the session
  scratchpad (the same tracked tree, no `.git`; the core gates are stdlib-only and need neither).
  Both sides ran the same script, with the proxy variables unset, and loaded all 46 test files.

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
