# REGRESSION — crlf-tolerant-hashing

Base: `6dae4fec26470cc1ef8391d48d9179806e65f351` (auto-detected: clean tree → `git merge-base HEAD origin/main`). The branch was rebased twice while the loop ran (origin/main gained #275/#276, then #277/#278); regress was re-run at each base — `ff9312f`, `c9900e7`, `6dae4fe` — and every run was no-regressions. The report and table below are the final run (iteration 3).

## Partition

Inside (31 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0, nothing escaped): `CHANGELOG.md`, `CLAUDE.md`, `docs/commands/{add,init,remove,status,update}.md`, `docs/contributing.md`, `docs/reference/pharn-records.md`, `docs/troubleshooting.md`, `src/lib/{apply-update,dest-drift,diff,hash,install-records,removal-backup,update-plan}.ts`, and `tests/{add,apply-update,dest-drift,diff,hash,init-archetype,install-records,overwrite-check,removal-backup,remove,update-dry-run-json,update-dry-run,update-plan,update}.test.ts`.

Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/crlf-tolerant-hashing/*` (the loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs. Style gates were skipped (no shared style config changed). The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
