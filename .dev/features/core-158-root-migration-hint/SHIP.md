# SHIP — core-158-root-migration-hint (Linear CORE-158, C1.1)

Worktree `.claude/worktrees/agent-a08548eaaddffc514`, off origin/main `991b229`. Nothing committed yet.

## Stages run, in order

1. `/pharn-dev-plan` → [PLAN.md](PLAN.md). GATE 1: approved. Open questions resolved: one hint line naming
   both `git mv` and `mv` (no git read), and the vendored `.agents/skills/pharn-cli/` left untouched (stale
   lines go to a pharn-dev/skills follow-up).
2. `/pharn-dev-grill` → [GRILL.md](GRILL.md), advisory: 7 concerns (0 blocking, 4 important, 3 minor). Applied
   in the build: the `exists` hint says "(or cannot be checked)", the ENOTDIR fallback is pinned by a unit
   test, the "never renamed" claim rests on a source test plus the integration tests, and update.md says
   when the hint appears. Left as named: the membership-guard test gap and the constant rename.
3. `/pharn-dev-build`. Build note: `planRootMigration` returns the `RootMigration` itself, with `userData`
   hints in place of `moves`. The move planner, `applyRootMoves`, `moveBlocks`, `rootMigrationFailed`,
   the move-backup plumbing (`rootMoveBackups`, `RootMigrationPlan.backups`, `backupAction`'s third
   argument and its `moving` phrases), the exit-1 path and the user-data half of `pendingRootMigration`
   are gone. The root-doc deletions are unchanged. `plan.rootMigration.moves` is the typed literal `[]`.
   During the build, `src/commands/init.ts` was found to read `migration.report` and was added to the
   plan's `## Files`. Net src −214 lines (132+, 346−).
4. `/pharn-dev-regress` → [regression-report.json](regression-report.json), [REGRESSION.md](REGRESSION.md).
5. `/pharn-dev-verify` → [verify-report.json](verify-report.json), [VERIFY.md](VERIFY.md).
6. `/pharn-dev-review` → [REVIEW.md](REVIEW.md), advisory: 0 floor-gate findings, 6 advisory (2 important:
   the inverted integration assertions to explain in the PR, and the stale vendored skill).

Ended at: GATE 2 (the human decision).

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` exit **0**.
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`no-regressions`**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`PASS`** (`failing_gates: []`).

## Human decision and rebase

- GATE 2: deliver (PR #372); the 12 pharn-ci TI02 removals and the tests-exercise warning accepted.
- Rebased onto origin/main `59d7ebb` (CORE-159/160/161/162). The user-data-move clause in CORE-162's
  `changesNoFiles` (`lib/update-next.ts`) is deleted, so a user-data hint alone changes nothing (no confirm,
  no write), while a root-doc delete still counts (`tests/update-next.test.ts`, and an integration case
  where `update --force` with only a hint rewrites neither state file). `unchangedOutcome` reports
  `{deleted: [], kept: []}`, so the hint still prints. The held-unit `rootMigration: null` contract is
  unchanged. The update-render coverage test (fe4e2c7) was dropped because CORE-162's predicate replaced
  the `migrates` line it covered. After the rebase: `CI=1 npm run check` passed (3661 passed, 1 skipped),
  and `npm run build` exited 0.

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
