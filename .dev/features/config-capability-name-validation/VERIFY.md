# VERIFY — config-capability-name-validation

## FLOOR layer (owns the verdict)

Gates run over the whole repo with the feature present, as a non-root user on node 22 with proxy
variables unset (as root with the session proxy set, 5 pre-existing tests in `init.test.ts` / `update.test.ts` fail for environmental reasons, identically at the baseline).

| gate           | exit          |
| -------------- | ------------- |
| `test`         | 0 (1277/1277) |
| `validate`     | 0             |
| `lint`         | 0             |
| `format:check` | 0             |
| `lint:md`      | 0             |
| `typecheck`    | 0             |

No `structural:*` gate — the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs` exit 0, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — no verifiers registered,
floor gates only.

Residual (P0/P7): "verified" means the named gates passed — not that the feature is correct in any
sense the suite does not encode.
