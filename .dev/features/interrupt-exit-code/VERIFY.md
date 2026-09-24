# VERIFY — interrupt-exit-code

## FLOOR layer (owns the verdict)

Gates run over the whole repo with the feature present, as a non-root user on node 22 with the session
proxy variables unset (as root with the proxy set, 5 pre-existing tests in `init.test.ts` /
`update.test.ts` fail for environmental reasons, identically at the baseline).

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

No `structural:*` gate — the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — floor gates only.

Residual (P0/P7): "verified" means the named gates passed — not that the feature is correct in any sense
the suite does not encode.
