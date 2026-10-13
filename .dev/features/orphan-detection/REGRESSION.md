# REGRESSION — orphan-detection

Base: `ff9312f45040a0cb0605f7ee447914db5aca0edc` (auto-detected: clean tree → `git merge-base HEAD origin/main`).

## Partition

Inside (26 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/commands/status.md`, `docs/commands/update.md`, `docs/contributing.md`, `docs/reference/pharn-records.md`, `docs/roadmap.md`, `src/commands/status.ts`, `src/commands/update.ts`, `src/lib/install-records.ts`, `src/lib/orphans.ts`, `src/lib/status-report.ts`, `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `src/steps/install-archetype.ts`, `tests/init-archetype.test.ts`, `tests/orphans.test.ts`, `tests/status-json.test.ts`, `tests/status-report.test.ts`, `tests/status.test.ts`, `tests/update-dry-run-json.test.ts`, `tests/update-dry-run.test.ts`, `tests/update-plan.test.ts`, `tests/update-report.test.ts`, `tests/update.test.ts`.

Orchestration note (advisory): the first `scope` run exited 1 because PLAN.md's `## Files` named the integration test files as alternatives ("whichever exist; checked at build") and two of the files actually touched (`tests/init-archetype.test.ts`, `tests/update-dry-run-json.test.ts`) were not spelled out. The plan's `## Files` was amended to list the exact test files touched (recorded in PLAN.md), and `scope` then exited 0. `.pharn/writes-scope.json` (scratch) and `.dev/features/orphan-detection/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
