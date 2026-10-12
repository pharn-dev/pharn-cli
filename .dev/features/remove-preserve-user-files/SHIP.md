# SHIP — remove-preserve-user-files (`/pharn-dev-ship --loop`, cap 3)

Stages run, in order: `/pharn-dev-plan` → GATE 1 (approved as written, 2026-10-13) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`. The run ended at **GATE 2** after iteration 1.

## Floor verdicts, verbatim

| stage                | verdict read                                           |
| -------------------- | ------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `PASS`               |

## Loop

| iteration | verify | regress          | `check-ship.mjs` decision |
| --------- | ------ | ---------------- | ------------------------- |
| 1         | `PASS` | `no-regressions` | `STOP_GREEN` (exit 0)     |

`node .dev/floor/check-ship.mjs … --iter 1 --cap 3` → `"decision": "STOP_GREEN"`, reason: "floor-GREEN: /verify PASS and /regress no-regressions — stop and present at the human gate".

## Pointers

- Review (advisory): [`REVIEW.md`](REVIEW.md)
- Grill (advisory): [`GRILL.md`](GRILL.md)

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
