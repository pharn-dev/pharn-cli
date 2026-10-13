# SHIP — install-surface-accounting (`/pharn-dev-ship --loop`, cap 3)

Stages run, in order: `/pharn-dev-plan` → GATE 1 (approved with one change to Q2, 2026-10-13) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`, then the loop body twice more. The run ended at **STOP_CAP** after iteration 3.

## Floor verdicts, verbatim

| stage                | verdict read                                                           |
| -------------------- | ---------------------------------------------------------------------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`                              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions`                 |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `FAIL`, `failing_gates` = `["test"]` |

## Loop

| iteration | verify | regress          | `check-ship.mjs` decision |
| --------- | ------ | ---------------- | ------------------------- |
| 1         | `FAIL` | `no-regressions` | `CONTINUE` (exit 3)       |
| 2         | `FAIL` | `no-regressions` | `CONTINUE` (exit 3)       |
| 3         | `FAIL` | `no-regressions` | `STOP_CAP` (exit 1)       |

`node .dev/floor/check-ship.mjs … --iter 3 --cap 3` → `"decision": "STOP_CAP"`, reason: "cap reached: iter 3 >= cap 3 without floor-GREEN — stop and hand to the human".

The `test` gate's only failures in all three iterations were in `tests/lint-gate.test.ts` (unchanged by this increment): `Test timed out in 5000ms` on its `eslint --stdin` child processes while the shared host's load average was 50–290. Iteration 2's fix addressed a review finding (the init outro), not this gate; no fix to it exists within the plan's `## Files`. See `VERIFY.md` for the out-of-loop evidence.

## Pointers

- Review (advisory): [`REVIEW.md`](REVIEW.md)
- Grill (advisory): [`GRILL.md`](GRILL.md)

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
