# REGRESSION — release-on-merge

Base: `6c04a7f0182cfbbf21abf071d16a70771f9df9e9` (`main` HEAD; auto-detected — the build is in the working tree, uncommitted).

## Partition

Inside (12 files, all within the plan's declared `## Files`; `check-regress.mjs scope` → `escaped: []`): `.dev/floor/check-run-pins.test.mjs`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/publish.yml`, `CHANGELOG.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/RELEASING.md`, `scripts/release-notes.mjs`, `tests/ci-workflow.test.ts`, `tests/publish-workflow.test.ts`, `tests/release-consistency.test.ts`, `tests/release-notes.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/release-on-merge/*` (the loop's own artifacts) were left out of `--changed`, as in prior increments — they are the loop's output, not a build escape.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 45 outside `.test.mjs`/`.test.cjs` files. Both sides ran in fresh `git worktree`s (the head one = base + the working-tree diff + the new untracked files), so the gitignored `test-*/` install trees could not colour `validate`. No outside eval pairs; style gates skipped (no shared style config changed). The feature's own vitest/floor tests are inside scope and are covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more. In particular `publish.yml` itself is not executed by any gate here; its runtime behaviour is first exercised by the next real release (plan residual R1).
