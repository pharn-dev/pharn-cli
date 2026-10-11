# REGRESSION — dry-run-json-compact

Base: `2c4155b246b7af1269381691a021a246d2a12406` (main, the pre-increment parent; forced by the coordinator, not auto-detected).

## Partition

Inside (11 product files, all within the plan's declared `## Files`): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/commands/update.md`, `docs/troubleshooting.md`, `src/commands/update.ts`, `src/index.ts`, `src/lib/update-report.ts`, `tests/index.test.ts`, `tests/update-dry-run-json.test.ts`, `tests/update-report.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/dry-run-json-compact/*` (the loop's own PLAN/GRILL artifacts) were left out of `--changed`; passed in, `check-regress.mjs scope` exits 1 on them as "outside declared writes", which is the loop's own output, not a build escape.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. Style gates were skipped (no shared style config changed). The vitest suite for the feature itself is inside scope and is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
