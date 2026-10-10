# REGRESSION — update-dry-run

Base: `1c96bf8f41107d972159a4545ceaca8a0cfb1581` (main, pre-increment parent; passed explicitly).

Inside (12 files, all within PLAN `## Files`): CHANGELOG.md, CLAUDE.md, README.md, docs/commands/update.md, docs/troubleshooting.md, src/commands/update.ts, src/index.ts, src/lib/update-plan.ts, tests/helpers.ts, tests/index.test.ts, tests/update-dry-run.test.ts, tests/update-plan.test.ts. Stage artifacts (`.dev/features/update-dry-run/`, `.pharn/`) are excluded from the partition. `escaped: []`.

Outside gates: 46 `.test.mjs`/`.test.cjs` files via `node --test`, and `validate.mjs` (whole repo). No committed eval pairs exist in this repo, so no `structural:*` gate. Style gates skipped: the increment touches no shared style config.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

REGRESSIONS: none — no deterministically-detectable breakage outside the feature

Residual: this catches what the suite catches, nothing more. The TypeScript vitest suite is not an outside gate here (the feature is inside it); it is covered by `npm run check` and `/pharn-dev-verify`.
