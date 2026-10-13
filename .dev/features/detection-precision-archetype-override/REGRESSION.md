# REGRESSION — detection-precision-archetype-override

Base: `6dae4fec26470cc1ef8391d48d9179806e65f351` (auto-detected: clean tree → `git merge-base HEAD origin/main`, after rebasing onto F-05's merge).

## Partition

Inside (18 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/commands/init.md`, `docs/getting-started.md`, `docs/reference/pharn-config.md`, `docs/troubleshooting.md`, `src/commands/init.ts`, `src/index.ts`, `src/lib/archetype.ts`, `src/lib/detect-archetype.ts`, `src/steps/archetype-summary.ts`, `src/types.ts`, `tests/archetype-summary.test.ts`, `tests/archetype.test.ts`, `tests/detect-archetype.test.ts`, `tests/index.test.ts`, `tests/init.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/detection-precision-archetype-override/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features. `src/lib/validate.ts` is declared but no longer differs from main (F-05 merged the identical declaration).

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
