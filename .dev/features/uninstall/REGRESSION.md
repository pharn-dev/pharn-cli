# REGRESSION — uninstall

Base: `ff9312f45040a0cb0605f7ee447914db5aca0edc` (auto-detected: clean tree → `git merge-base HEAD origin/main`).

## Partition

Inside (19 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/README.md`, `docs/commands/uninstall.md`, `docs/contributing.md`, `docs/reference/pharn-records.md`, `docs/troubleshooting.md`, `src/commands/uninstall.ts`, `src/index.ts`, `src/lib/hook-wiring.ts`, `src/lib/install-manifest.ts`, `src/lib/install-records.ts`, `src/lib/uninstall-plan.ts`, `tests/hook-wiring.test.ts`, `tests/index.test.ts`, `tests/install-manifest.test.ts`, `tests/uninstall-plan.test.ts`, `tests/uninstall.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/uninstall/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features. `tests/project-lock-commands.test.ts` was declared but not needed (the lock refusal is covered in `tests/uninstall.test.ts`).

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
