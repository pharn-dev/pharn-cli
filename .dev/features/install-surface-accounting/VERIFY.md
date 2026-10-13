# VERIFY — install-surface-accounting

## Iteration 3

| gate         | exit |
| ------------ | ---- |
| test         | 1    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFY FAILS: gate(s) test red — stage FAILS

No code changed since iteration 2. The run waited for the host load to fall (it hit its 45-minute cap and started at a 1-minute load average of 50): 2300 passed, 1 skipped, 2 failed — both in `tests/lint-gate.test.ts` (`Test timed out in 5000ms`).

Out-of-loop evidence (informational, not a gate): `tests/lint-gate.test.ts` alone passes 7/7 at its default timeout once the load fell; the whole suite under `vitest run --coverage --testTimeout=60000` passes 2302/2302 (1 skipped) with the coverage thresholds met.

## Iteration 2

| gate         | exit |
| ------------ | ---- |
| test         | 1    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFY FAILS: gate(s) test red — stage FAILS

`test`: 2297 passed, 1 skipped, 5 failed — again only `tests/lint-gate.test.ts` (`Test timed out in 5000ms` on its `eslint --stdin` spawns), host load average 185 → 286 during the run.

## Iteration 1

| gate         | exit |
| ------------ | ---- |
| test         | 1    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFY FAILS: gate(s) test red — stage FAILS

`test` ran as `CI=1 VITEST_MAX_WORKERS=2 npm test`: 2295 passed, 1 skipped, 6 failed — all six in `tests/lint-gate.test.ts` (outside this increment), each `Test timed out in 5000ms` on an `eslint --stdin` child process while the shared host's load average was ~85–190.

Verifiers: no verifiers registered — floor gates only.

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
