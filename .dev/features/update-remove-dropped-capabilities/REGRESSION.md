# REGRESSION — update-remove-dropped-capabilities

Base: `ff9312f45040a0cb0605f7ee447914db5aca0edc` (auto-detected: clean tree → `git merge-base HEAD origin/main`).

## Partition

Inside (25 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/commands/add.md`, `docs/commands/init.md`, `docs/commands/list.md`, `docs/commands/update.md`, `docs/contributing.md`, `docs/reference/pharn-config.md`, `docs/reference/pharn-records.md`, `docs/troubleshooting.md`, `src/commands/add.ts`, `src/commands/remove.ts`, `src/commands/update.ts`, `src/lib/capability-dir.ts`, `src/lib/dest-drift.ts`, `src/lib/merge-capabilities.ts`, `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `tests/capability-dir.test.ts`, `tests/update-dry-run-json.test.ts`, `tests/update-dry-run.test.ts`, `tests/update-plan.test.ts`, `tests/update-report.test.ts`, `tests/update.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/update-remove-dropped-capabilities/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
