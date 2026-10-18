# REGRESSION — dead-code-shared-helpers

Base: `72d3fde14a91f023f98c59273e7c3d700e5789f9` (`git merge-base HEAD origin/main`, after the rebase onto
PRs #300 and #308). Head: the build committed as `95de371` (a WIP commit on
`refactor/dead-code-and-shared-helpers`). Both sides ran in fresh trees extracted with `git archive`, so
gitignored local fixtures cannot colour either result.

## Partition

Inside (30 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0):
`CHANGELOG.md`, `CLAUDE.md`, 20 files under `src/`, 8 test files (see `regression-report.json`
`inside`). `.dev/features/dead-code-shared-helpers/*` (the loop's own artifacts) and `.pharn/**`
(scratch) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs.
Style gates were skipped (no shared style config changed). The vitest suite is covered by
`/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
