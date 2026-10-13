# REGRESSION — install-surface-accounting

Base: `ff9312f45040a0cb0605f7ee447914db5aca0edc` (auto-detected: clean tree → `git merge-base HEAD origin/main`).

## Partition

Inside (29 product files; `check-regress.mjs scope` exit 0 on the second run, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/README.md`, `docs/commands/init.md`, `docs/commands/status.md`, `docs/commands/update.md`, `docs/contributing.md`, `docs/getting-started.md`, `src/commands/status.ts`, `src/commands/update.ts`, `src/lib/absent-surfaces.ts`, `src/lib/install-capabilities.ts`, `src/lib/install-manifest.ts`, `src/lib/status-report.ts`, `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `src/steps/install-archetype.ts`, and 11 test files under `tests/`.

**Scope finding, surfaced (floor, P0 fix#7):** the FIRST `scope` run exited 1 — `tests/status-json.test.ts` was changed but not in the plan's `## Files` (the plan named the status tests individually and missed the `--json` command test that Resolved decision 2 needed). It was declared in `PLAN.md` as an "ADDED AT BUILD" entry (alongside `README.md`, `docs/README.md`, `docs/getting-started.md`, the one-word `.cjs` → `.cjs`/`.mjs` doc syncs), and `scope` was re-run → exit 0. For the human at GATE 2: the plan was amended after the build, not before it.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/install-surface-accounting/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

Iteration 2 (after the outro fix, `d06bb40`): `scope` exit 0 (29 inside, nothing escaped); base → head again `tests 0 → 0`, `validate 0 → 0`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
