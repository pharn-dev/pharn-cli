# REGRESSION — gitignore-run-state

- base: `fe16608` (origin/main, the branch's fork point); head: `ce375a0`
- inside (the changed scope): the 42 files in `regression-report.json` `.inside`. The regress scope check found nothing outside the declared `## Files`, after the human-approved amendment.
- outside gates: the 46 `.mjs`/`.cjs` floor/hook tests (`tests`), plus whole-repo `validate`, `vitest`, `format:check`, `lint`, `lint:md`. Each was run in a fresh detached worktree at each side after `npm ci`, so no gitignored local fixtures leak in.

| gate         | base | head |
| ------------ | ---- | ---- |
| tests        | 0    | 0    |
| validate     | 0    | 0    |
| vitest       | 0    | 0    |
| format:check | 0    | 0    |
| lint         | 0    | 0    |
| lint:md      | 0    | 0    |

regressions: none · pre_existing: none

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature** (`check-regress.mjs verdict`, exit 0).

This catches exactly what the suite catches, nothing more: a regression no deterministic check covers is invisible here.
