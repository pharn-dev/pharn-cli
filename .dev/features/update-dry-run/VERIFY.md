# VERIFY — update-dry-run

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

VERIFIED: floor gates PASS

Note: an earlier run of this gate set had `test` = 1 (two 5 s timeouts in `tests/lint-gate.test.ts`, an untouched file that spawns eslint) while the host's load average was about 90 from other projects. It was re-run after the load dropped, and the table above is that re-run. No code changed between the two runs.

Verifiers: no verifiers registered — floor gates only.

Residual: verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
