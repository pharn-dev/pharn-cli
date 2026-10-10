# REGRESSION — models-label-truth

Base: `1c96bf8f41107d972159a4545ceaca8a0cfb1581` (main, pre-increment parent). Inside = the 15 product files named in PLAN.md `## Files` (the feature's own `.dev/features/models-label-truth/` artifacts and `.pharn/` scratch are excluded from the scope check as process artifacts).

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

(`tests` = `node --test` over the 46 outside `*.test.mjs`/`*.test.cjs`; `validate` = `.dev/floor/validate.mjs .`.)

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite catches, nothing more. The vitest suite is not a regress gate in this stage; it is run by build/verify.
