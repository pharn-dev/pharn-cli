# VERIFY — uninstall

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFIED: floor gates PASS

`test` ran as `CI=1 VITEST_MAX_WORKERS=2 npm test -- --testTimeout=60000` (2356 passed, 1 skipped). Orchestration note (advisory): the same command at vitest's default 5 s per-test timeout exited 1 on the host's load average of 100–220 (other agents running) with 7 timeouts, all in two files this increment does not touch — `tests/lint-gate.test.ts` (each case spawns eslint; one eslint run took 10 s wall at 18 % CPU) and `tests/publish-workflow.test.ts` (one registry-check case). Both files pass at the longer timeout, alone and in the full run. No assertion was changed; only the per-test time budget.

Verifiers: no verifiers registered — floor gates only.

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
