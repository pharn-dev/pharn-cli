# REGRESSION — init-dry-run

Base: `ff9312f45040a0cb0605f7ee447914db5aca0edc`, auto-detected: the tree was clean, so the base is `git merge-base HEAD origin/main`.

## Partition

Inside: 26 product files, all within the plan's declared `## Files`. `check-regress.mjs scope` exited 0, and nothing escaped the declared files.

- Docs: `CHANGELOG.md`, `CLAUDE.md`, `README.md`, and `docs/{commands/init,contributing,getting-started,roadmap,troubleshooting}.md`.
- Source: `src/commands/init.ts`, `src/index.ts`, `src/lib/{init-plan,init-report,write-targets}.ts` and `src/steps/{archetype-summary,install-archetype,overwrite-check,prereqs}.ts`.
- Tests: `tests/{archetype-summary,index,init-dry-run-json,init-dry-run,init-report,init-yes,init,prereqs,write-targets}.test.ts`.

Orchestration note (advisory): as in earlier features, `--changed` leaves out `.pharn/writes-scope.json` (scratch) and `.dev/features/init-dry-run/*` (the loop's own artifacts).

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

- `tests` is `node --test` over the 46 `.test.mjs` and `.test.cjs` files outside the feature.
- There are no committed eval pairs.
- The style gates were skipped, because no shared style config changed.
- The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
