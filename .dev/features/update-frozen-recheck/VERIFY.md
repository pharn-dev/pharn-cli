# VERIFY — update-frozen-recheck

## FLOOR layer (owns the verdict)

Gates run over the whole repo with the feature present, on node 22 with the session proxy variables unset
and as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` / `CAP_FOWNER` (`setpriv`) — the
CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

`test` is vitest (1498 tests), which collects this increment's own tests (`tests/update.test.ts`, the
"a formerly-frozen capability that parses again" block). `test:floor` is floor.yml's `node --test` run
(754 tests). No `structural:*` gate — the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — no verifiers registered, floor
gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond what those
gates check — verifier concerns are advisory help, not assurance.
