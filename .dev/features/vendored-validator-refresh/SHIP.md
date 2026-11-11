# SHIP — vendored-validator-refresh

Advisory roll-up of a gated `/pharn-dev-ship` run (no `--loop`).

## Stages run, in order

1. `/pharn-dev-plan` → `PLAN.md`. GATE 1: approved as written by the maintainer, 2026-11-11 (port the
   displaced-fence detection; open the PR stacked on `fix/models-triage-stage`).
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 5 concerns, 0 blocking-severity). The two important
   ones (the displaced reason needs a closing fence; edge rows for BOM + blank line and an
   unterminated displaced block) were covered inside the planned files.
3. `/pharn-dev-build` → the plan's `## Files`. `npm run check` GREEN (107 files, 3511 tests).
4. `/pharn-dev-regress` → `regression-report.json`.
5. `/pharn-dev-verify` → `verify-report.json`.
6. `/pharn-dev-review` → `REVIEW.md`. The run ends at GATE 2.

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`"no-regressions"`**
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`)

Also run outside the verdicts: `npm run test:coverage` exit 0, `npm run build` exit 0.

## Pointers

- Review findings: `.dev/features/vendored-validator-refresh/REVIEW.md`
- Grill-log (advisory): `.dev/features/vendored-validator-refresh/GRILL.md`

## Decision

The standing decision (merge / fix / abandon) is the human's.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.

## GATE 2 (recorded after the run)

The maintainer chose to fix the P1 minor finding (`REVIEW.md`, the BOM row's non-vacuity) and open
the PR without merging. One assertion was added (`upstream accepts the byte-order-mark and CRLF
rows`); `npm run check` re-ran GREEN (3512 tests) and `validate` exit 0.
