# VERIFY — status-json

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFIED: floor gates PASS

No verifiers registered — floor gates only.

Note on a first run: an earlier verify pass at machine load average ~37 recorded `test` = 1. Five `tests/lint-gate.test.ts` cases timed out at 5000 ms. Those cases spawn eslint, and the failures were the load timeout, not an assertion. The same gate passed once load dropped, and the verdict above is from that clean run.

Verified = the named gates passed. This is NOT a guarantee of correctness beyond what those gates check.
