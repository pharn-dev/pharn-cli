# REGRESSION — status-json

- Base: `1c96bf8f41107d972159a4545ceaca8a0cfb1581` (main, the pre-increment parent), per the invoker.
- Inside (22 files): the `src/`, `tests/`, docs and CHANGELOG paths listed in `regression-report.json` `.inside`. Pipeline artifacts under `.dev/features/status-json/` and the `.pharn/` scratch are not feature changes and are excluded.
- Scope check: `check-regress.mjs scope` exits 0 with no escapes. An earlier pass found one: the build had added `tests/status-json.test.ts` without it being in the plan's `## Files`. The plan now declares it.
- Outside gates: `tests` runs 46 `.test.mjs`/`.test.cjs` files under `node --test`. `validate` runs `.dev/floor/validate.mjs`. Style gates were skipped because the feature touches no shared style config.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches only what the deterministic suite catches. The feature's own vitest suite is verified by `/pharn-dev-verify`.
