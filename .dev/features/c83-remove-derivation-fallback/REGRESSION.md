# REGRESSION — c83-remove-derivation-fallback

## Base and scope

- **Base:** `33ffae193879e0e634329e3226d470a3ea7670c5` (HEAD = origin/main). The working tree is uncommitted, so per the base rule `base = HEAD`.
  - The base side ran from a `git archive` extraction of that commit, with no `.git`, and `node_modules` symlinked (package.json is unchanged).
- **Inside:** 61 paths (`git diff --name-only HEAD` plus untracked), all within the PLAN's `## Files`. `check-regress.mjs scope` exited 0, with no fix #7 breach. The machine list is in `regression-report.json` `.inside`.
- **Outside gates:**
  - `tests`: the 47 committed `*.test.mjs` floor tests, run with `node --test`.
  - `validate`: whole-repo.
  - `vitest:outside`: the 78 `tests/**/*.test.ts` files this change did not touch.
  - The style gates `lint`, `format:check` and `lint:md` also ran, because `eslint.config.mjs` is inside.

## Gate results (exit codes)

| gate | base | head |
| --- | --- | --- |
| format:check | 0 | 0 |
| lint | 0 | 0 |
| lint:md | 0 | 0 |
| tests | 0 | 0 |
| validate | 0 | 0 |
| vitest:outside | 1 | 0 |

- `regressions[]`: none.
- `pre_existing[]`: `vitest:outside`. Its base RED comes from `tests/repo-runtime-state.test.ts`, which asks git about `.pharn/` and fails in the base extraction because that has no `.git`. It is an artifact of the base checkout method, not of the code, and it is GREEN at HEAD.

## Verdict

REGRESSIONS: none — no deterministically-detectable breakage outside the feature (`check-regress.mjs verdict`: `no-regressions`, exit 0).

Residual: this catches exactly what the suite above catches, nothing more. A behaviour with no test, rule or eval is invisible to it.
