# VERIFY — detection-precision-archetype-override

| gate         | exit |
| ------------ | ---- |
| test         | 1    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFIED: NO — floor verdict FAIL, `failing_gates: ["test"]` (iteration 3 of 3).

`test` ran as `CI=1 VITEST_MAX_WORKERS=2 npm test` (iteration 1) and `CI=1 VITEST_MAX_WORKERS=1 npm test` (iterations 2 and 3) on a host shared with other agents, 1-minute load average 90-230. Every failing case was a vitest 5000 ms timeout in a suite that spawns subprocesses and that this increment does not touch:

- iteration 1: 8 failed / 2473 passed — `tests/lint-gate.test.ts` (6), `tests/publish-workflow.test.ts` (1), `tests/release-notes.test.ts` (1);
- iterations 2 and 3: 2 failed / 2479 passed — `tests/lint-gate.test.ts` "accepts clean source, so the gate is not simply always-red" and "still flags \_\_dirname and require in an ESM .mjs" (each ~6.7 s).

Diagnostic (advisory, not a gate): those three files run alone with `--testTimeout=120000` → 34/34 passed. All of the increment's own test files pass (758 tests across the seven touched/adjacent files).

Verifiers: no verifiers registered — floor gates only.

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
