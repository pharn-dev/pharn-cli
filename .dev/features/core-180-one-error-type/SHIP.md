# SHIP — core-180-one-error-type

## Stages

The stages ran in this order:

1. `/pharn-dev-plan`, then GATE 1. The coordinator approved the plan on 2026-11-16 and resolved all six open questions as recommended.
2. `/pharn-dev-grill`
3. `/pharn-dev-build`
4. `/pharn-dev-regress`
5. `/pharn-dev-verify`
6. `/pharn-dev-review`

The run ends at GATE 2. The coordinator's rule for GATE 2: proceed to the PR when regress is clean, verify is PASS and REVIEW.md has no floor-gate finding.

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exited **0** (`FLOOR: GREEN`), and `npm run check` exited 0.
- `/pharn-dev-regress`: `regression-report.json` `.verdict` is **`no-regressions`**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` is **`PASS`**, with `failing_gates: []`. The same verdict held when the gates were re-run after the review fix (6ef91ff).

## Plan changes during the run

Three paths were added to PLAN.md during the run, each declared there before it was written:

- `docs/troubleshooting.md`, from GRILL finding 5;
- `tests/support/exit-code.ts`, after a build-time failure;
- `src/steps/add-picker.ts`, a review fix.

## Reports

- Review: [REVIEW.md](./REVIEW.md). It has no floor-gate findings; its advisory findings are listed there, and one of them is fixed.
- Grill: [GRILL.md](./GRILL.md), advisory.

The chain ran and the floor verdicts are as shown. This is not a judgment that the increment is good or wise. That is the human's call at the post-review gate.
