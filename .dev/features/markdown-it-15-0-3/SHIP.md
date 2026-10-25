# SHIP — markdown-it-15-0-3

Dependabot alerts 23, 21 and 22 (`markdown-it` `>= 15.0.0, < 15.0.3`), fixed in one run by the human's
choice at GATE 1.

## Stages run, in order

1. `/pharn-dev-plan` → `PLAN.md`; **GATE 1**: the human approved it as written (fix shape: bump
   `markdownlint-cli2`; one run for all three alerts).
2. `/pharn-dev-grill` → `GRILL.md` (advisory: 4 concerns, 0 blocking). The important one — prove the lock
   under `npm ci` — was acted on during the build.
3. `/pharn-dev-build` → `validate` exit **0** (`npm run check` exit 0).
4. `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`**.
5. `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`**.
6. `/pharn-dev-review` → `REVIEW.md` (advisory; see that file).

The run ended at **GATE 2**.

## Pointers

- Review: `.dev/features/markdown-it-15-0-3/REVIEW.md`
- Grill (advisory): `.dev/features/markdown-it-15-0-3/GRILL.md`

## Build note

The `markdown-it floor` test was written first and failed against the 15.0.1 lockfile
(`node_modules/markdown-it: 15.0.1`). `npm install --save-dev markdownlint-cli2@^0.24.0` then produced a
lockfile byte-identical to the plan's trial; a clean `npm ci` resolved `markdown-it` 15.0.3 and the test
passed. CHANGELOG `[Unreleased]` gained a `### Security` entry; no version bump. Nothing is committed.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
