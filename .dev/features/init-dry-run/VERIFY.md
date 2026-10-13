# VERIFY — init-dry-run

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFIED: floor gates PASS

`test` ran as `CI=1 npx vitest run --coverage --maxWorkers=2 --testTimeout=60000`, with this result:

- Test files: 89 passed.
- Tests: 2312 passed, 1 skipped.
- Coverage: statements 97.73, branches 93.98, functions 98.06, lines 98.59. The ratchet thresholds held.

Two settings in that command are host accommodations, not changes to any assertion:

- `CI=1` turns picocolors on, as in CI.
- Two workers and a 60 s per-test timeout: the shared host's load average was 50–108 during the run.

The same suite with the default 5 s timeout failed only by timeout, in three files outside the feature that spawn subprocesses: `lint-gate`, `publish-workflow` and `model-config-parity`. Every one of those failures was `Test timed out in 5000ms`; none was an assertion.

Verifiers: no verifiers registered — floor gates only.

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
