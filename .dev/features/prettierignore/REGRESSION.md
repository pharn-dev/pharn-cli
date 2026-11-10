# REGRESSION — prettierignore

- base: `c1c55a6` (HEAD; a working-tree build, so `git status --porcelain` is non-empty → base = HEAD); head: the working tree.
- inside (the changed scope): the 40 files in `regression-report.json` `.inside` — `git diff --name-only HEAD` plus untracked files, minus `pharn/.backup/` (a backup that predates this session, not part of the build) and `.pharn/` (scratch). `check-regress.mjs scope` found nothing outside the declared `## Files` (exit 0).
- outside gates: the 46 `.mjs`/`.cjs` floor/hook tests (`tests`), plus whole-repo `validate`, `vitest`, `format:check`, `lint`, `lint:md`. The base ran in a fresh detached worktree after `npm ci`; head ran in the working tree.

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
