# VERIFY — crlf-tolerant-hashing

## Floor gates (exit codes) — final run (iteration 3)

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

`test` = `CI=1 npx vitest run --maxWorkers=1` (the vitest suite `npm test` runs, with the worker count capped on a shared machine; no test timeout or other setting changed): 86 files, 2351 passed, 1 skipped. No committed eval pairs, so there is no `structural:*` gate.

**VERIFIED: floor gates PASS** (`node .dev/floor/check-verify.mjs` exit 0, `failing_gates: []`).

## Iteration history (as the floor reported it)

1. At `ff9312f`: PASS (85 files, 2293 passed). `check-ship`: STOP_GREEN. Before the loop stopped, `origin/main` had moved (#275, #276), so the branch was rebased and the gates re-run.
2. Rebased onto `c9900e7`: FAIL `[test]`: 5 tests hit the 5000 ms timeout (`lint-gate.test.ts` ×3, `publish-workflow.test.ts` ×1, `update.test.ts` ×1). Load average was about 90. `check-ship`: CONTINUE. Rebased again onto `6dae4fe` (#277, #278): FAIL `[test]`: 6 timeouts (`lint-gate.test.ts` ×5, `publish-workflow.test.ts` ×1). `check-ship` (iter 2): CONTINUE. No code was changed between runs. None of the timed-out files is in this increment's `## Files`, and the two files also timed out when run alone while the machine was loaded.
3. At `6dae4fe`, run with one worker once the load had dropped: PASS. `check-ship` (iter 3, cap 3): STOP_GREEN.

## Verifiers (advisory)

No verifiers are registered, so only the floor gates ran (`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`).

Verified means the named gates passed. It does NOT guarantee correctness beyond what those gates check, and verifier concerns would be advisory help, not assurance. In particular the fold has never run on Windows: the tests use CRLF bytes and a real `git -c core.autocrlf=true` checkout on POSIX only.
