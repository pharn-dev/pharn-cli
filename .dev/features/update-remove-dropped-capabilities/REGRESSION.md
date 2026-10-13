# REGRESSION — update-remove-dropped-capabilities

Base: `7f1b727b1b29d44ddc2985fa94740349f44e42b9` (auto-detected: clean tree → `git merge-base HEAD origin/main`, after the GATE 2 rebase). An earlier run of the update half against base `ff9312f` was also `no-regressions`.

## Partition

Inside: 42 product files, all within the plan's declared `## Files` and `### Files (init half)`; `check-regress.mjs scope` exit 0, nothing escaped. Orchestration note (advisory): `.pharn/` (scratch) and `.dev/features/update-remove-dropped-capabilities/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
