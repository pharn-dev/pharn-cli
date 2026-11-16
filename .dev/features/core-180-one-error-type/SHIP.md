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

## After GATE 2: rebased onto C5.6 and C5.5

The branch was rebased onto origin/main twice: after #385 (C5.6) and after #386 (C5.5). Both times the conflicts were resolved by keeping main's code and applying the CliError change on top of it.

- `status.ts` now uses `buildStatusReport`. Its failures throw `CliError.failure`, and a `--strict` verdict throws `CliError.reported()`.
- `runCli` loads the reporter lazily, so `--version` and `--help` stay clack-free.
- C5.5 moved the argv refusal into `main(args)`. By the coordinator's instruction, it now prints its two lines and throws `CliError.reported()` instead of calling `process.exit`.
- `process.exit` is therefore lint-confined to `src/lib/fatal-signal.ts` alone, which is narrower than the "index.ts and fatal-signal.ts" that PLAN.md, REVIEW.md and the ticket name. A `lint-rules` row now shows the rule fires in `src/index.ts`.
- This resolves REVIEW's P3 finding about the argv refusals.

`npm run check` and `npm run build` were re-run after the rebase. Their results are in the PR. A third rebase, onto #387 (C5.4), conflicted only in `CLAUDE.md`. C5.4's "names the files already written" failure message now reaches the user as `CliError.failure`.

## After the PR: clearing pharn-ci's TESTS_NOT_EXERCISING_CHANGES warning

At the coordinator's instruction:

- `src/lib/repo.ts` was reverted: its old comment is still true. `src/steps/add-picker.ts` and add's matching branch were reverted too. That type-only cleanup is left for C5.2, and REVIEW's P7 finding is unfixed again.
- Three comment-only files keep their edits, because the old comments described a `process.exit` or `cancelAndExit` that is gone: `min-cli-gate.ts`, `update-render.ts` and `overwrite-check.ts`. Each gets one assertion in its own test file about the behaviour the comment describes:
  - the gate returns a refusal and never throws or exits;
  - an aborted run's backup notice goes to stderr;
  - a cancelled overwrite prompt returns `cancel` and nothing exits.
- `tests/commands/init.test.ts` and `tests/commands/remove.test.ts` each get a describe that pins the mechanism: a refusal rejects with a CliError carrying exit 1, a cancel rejects with exit 0, and the line comes out once, through `reportCliError`.

All of these test files are declared in PLAN.md.

## Reports

- Review: [REVIEW.md](./REVIEW.md). It has no floor-gate findings; its advisory findings are listed there, and one of them is fixed.
- Grill: [GRILL.md](./GRILL.md), advisory.

The chain ran and the floor verdicts are as shown. This is not a judgment that the increment is good or wise. That is the human's call at the post-review gate.
