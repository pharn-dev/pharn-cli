# VERIFY — command-integration-suites

FLOOR verdict (`check-verify.mjs`, verbatim): **PASS** — every gate exit 0.

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

No `structural:*` gate: the feature ships no eval pair.

Advisory layer: no verifiers registered — floor gates only.

Measured alongside (advisory, not verdict inputs):

- AC2: `git grep -lE "vi\.(do)?[mM]ock\(['\"](\.\./)+src/" -- tests` → `tests/index.test.ts` only.
- Coverage (`vitest run --coverage`): 98.05 / 95.00 / 98.73 / 98.79 (statements / branches /
  functions / lines) against the new 90 / 85 / 90 / 90 floor; the start of the branch measured
  97.95 / 95.11 / 98.73 / 98.70.
- `npm run check` passed at each of the branch's six commits; `npm run build` passes at HEAD.
- Wall time, back to back on this machine (`heavy.sh npx vitest run --maxWorkers=2`): main 16.29 s /
  16.79 s, branch 19.36 s / 19.76 s (vitest Duration) — 1.18–1.21×, under the 1.25× bound.
