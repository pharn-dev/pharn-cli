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

`test` ran, after the GATE 2 rebase onto `origin/main` 5fc4e46, as `CI=1 npx vitest run --maxWorkers=2 --testTimeout=120000` (95 files, 2562 passed, 1 skipped), and again under `npm run test:coverage -- --maxWorkers=2 --testTimeout=120000` (same counts; thresholds met: 97.9 % statements, 94.51 % branches, 98.24 % functions, 98.69 % lines). Orchestration note (advisory): the raised per-test budget is for the host's load average (100–270, other agents running); at vitest's default 5 s an earlier, pre-rebase run timed out only in `tests/lint-gate.test.ts` (each case spawns eslint) and one `tests/publish-workflow.test.ts` case — files this increment does not touch — and both pass at the longer budget. No assertion was changed.

Verifiers: no verifiers registered — floor gates only.

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
