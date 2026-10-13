# SHIP — update-remove-dropped-capabilities (`/pharn-dev-ship --loop`, cap 3)

Stages run, in order: `/pharn-dev-plan` → GATE 1 (approved with one scope change — `update` only, `init` deferred — 2026-10-13) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → (iteration 2) fix → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`. The run ended at **GATE 2** after iteration 2.

## Floor verdicts, verbatim

| stage                | verdict read                                           |
| -------------------- | ------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit `0`              |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` = `no-regressions` |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict` = `PASS`               |

## Loop

| iteration | verify | regress          | `check-ship.mjs` decision |
| --------- | ------ | ---------------- | ------------------------- |
| 1         | `FAIL` | `no-regressions` | `CONTINUE` (exit 3)       |
| 2         | `PASS` | `no-regressions` | `STOP_GREEN` (exit 0)     |

Iteration 1's `failing_gates: ["test"]` were 6 timeouts in files outside the increment under host load 74–98 (see `VERIFY.md`). Iteration 2 applied the review's advisory fixes within `## Files` and re-ran at load ~21.

`node .dev/floor/check-ship.mjs … --iter 2 --cap 3` → `"decision": "STOP_GREEN"`, reason: "floor-GREEN: /verify PASS and /regress no-regressions — stop and present at the human gate".

## Pointers

- Review (advisory): [`REVIEW.md`](REVIEW.md)
- Grill (advisory): [`GRILL.md`](GRILL.md)

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
