# VERIFY — orphan-detection

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFIED: floor gates PASS

`test` ran as `CI=1 npm test -- --maxWorkers=2 --testTimeout=120000` (picocolors on, as in CI; two workers for the host's memory): 85 files, 2346 passed, 1 skipped. The raised per-test timeout is an environment accommodation, not a change to any test: during the build run the host's load average was 30–97 (other agents), and the five `tests/lint-gate.test.ts` cases that spawn `eslint` took 13–30 s each and hit the 5 s default. Nothing in this increment touches the lint gate or its config.

Verifiers: no verifiers registered — floor gates only.

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
