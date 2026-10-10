# REGRESSION — update-dry-run-json

Base: `37c6f15d87be18a088fe14b5976dee9c603b3121` (main, pre-increment parent; passed explicitly, never HEAD).

Inside (18 files, all within PLAN `## Files`): CHANGELOG.md, CLAUDE.md, README.md, docs/commands/update.md, docs/troubleshooting.md, src/commands/update.ts, src/index.ts, src/lib/json-report.ts, src/lib/status-report.ts, src/lib/update-plan.ts, src/lib/update-report.ts, src/steps/node-prereq.ts, tests/index.test.ts, tests/json-report.test.ts, tests/node-prereq.test.ts, tests/update-dry-run-json.test.ts, tests/update-plan.test.ts, tests/update-report.test.ts. Stage artifacts (`.dev/features/update-dry-run-json/`, `.pharn/`) are excluded from the partition, as in the update-dry-run increment. `escaped: []`.

Outside gates: 46 `.test.mjs`/`.test.cjs` files via `node --test`, and `validate.mjs` (whole repo). No committed eval pairs exist, so no `structural:*` gate. Style gates skipped: the increment touches no shared style config.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

REGRESSIONS: none — no deterministically-detectable breakage outside the feature

Residual: this catches what the suite catches, nothing more. The TypeScript vitest suite is not an outside gate here (the feature is inside it); it is covered by `npm run check` and `/pharn-dev-verify`.
