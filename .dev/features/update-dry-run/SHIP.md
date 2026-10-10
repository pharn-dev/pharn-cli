# SHIP — update-dry-run (`--loop`, advisory roll-up)

Stages run, in order (GATE 1 was passed before the loop): grill → build → regress → verify → review. Iterations: 1. The run ended at **GATE 2** with `STOP_GREEN`.

| stage | structural verdict read |
| --- | --- |
| build | `validate.mjs` exit `0` (`FLOOR: GREEN — 0 capabilities checked`); `npm run check` exit `0` |
| regress (base `1c96bf8f41107d972159a4545ceaca8a0cfb1581`) | `regression-report.json` `.verdict` = `no-regressions` |
| verify | `verify-report.json` `.verdict` = `PASS` (test, validate, lint, format:check, lint:md, typecheck all 0) |
| check-ship (`--iter 1 --cap 3`) | decision `STOP_GREEN`, exit `0` |

Notes: the first verify attempt had `test` = 1 (two 5 s timeouts in the untouched `tests/lint-gate.test.ts`, host load average about 90 from other projects). The gate set was re-run after the load dropped and passed; no code changed between runs. Two later CI-parity runs (`CI=1 vitest`, `test:coverage`) also failed once under load or interruption and passed on re-run.

Pointers: `.dev/features/update-dry-run/GRILL.md` (advisory), `.dev/features/update-dry-run/REVIEW.md`.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
