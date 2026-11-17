# BUILD — core-155-v0-22-0-removals

- Plan: `PLAN.md` (approved at GATE 1 as written; addendum: target v0.21.0).
- Built: every file under `## Files`, plus `tests/capability-index.test.ts` (declared in the plan's
  extra list) whose flat-shaped fixture needed the pharn marker.
- Floor verdict (`node .dev/floor/validate.mjs .`): exit 0, `FLOOR: GREEN`.
- After the rebase onto #404: format:check 0, lint 0, lint:md 0, typecheck 0, test 0 (105 files,
  3595 passed, 1 skipped; coverage 98.52 / 95.61 / 99.06 / 99.01). `npm run build`: 0.
- Tests: no test file and no test title removed (every one of main's 2553 titles present at HEAD);
  three `it.each` tables lost their `flat` rows (templates kept).
