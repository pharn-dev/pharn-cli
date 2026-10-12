# REGRESSION — remove-preserve-user-files

Base: `1e59c51f38caab72f2144e7603e5d7961bcfc107` (auto-detected: clean tree → `git merge-base HEAD origin/main`).

## Partition

Inside (13 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/commands/add.md`, `docs/commands/remove.md`, `docs/contributing.md`, `docs/reference/pharn-records.md`, `docs/roadmap.md`, `docs/troubleshooting.md`, `src/commands/remove.ts`, `src/lib/removal-backup.ts`, `tests/removal-backup.test.ts`, `tests/remove.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/remove-preserve-user-files/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
