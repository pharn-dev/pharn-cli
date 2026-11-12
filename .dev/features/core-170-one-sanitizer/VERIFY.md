# VERIFY — core-170-one-sanitizer

Head `09a6c47`, run with `CI=1` (colour on, as in the `Test` job).

| gate | exit |
| --- | --- |
| test (`npm test`) | 0 |
| validate (`node .dev/floor/validate.mjs .`) | 0 |
| lint | 0 |
| format:check | 0 |
| lint:md | 0 |
| typecheck | 0 |

No `structural:*` gate: the increment ships no committed eval pair (its evals are the vitest cases in the PLAN). Verifiers: none registered (`count-verifiers.mjs` → 0), so no advisory annotations.

**VERIFIED: floor gates PASS** (`check-verify.mjs` verdict `PASS`, `failing_gates: []`). Also checked outside this gate set: `npm run build` exits 0.
