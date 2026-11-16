# SHIP — core-164-init-carry-over (Linear CORE-164, C2.2)

Worktree `.claude/worktrees/agent-a6c46d928cc8614a3`, branch `przemek/core-164-c22-re-run-init-carries-capabilities-over`, off origin/main `688a838`.

## Stages run, in order

1. `/pharn-dev-plan` → [PLAN.md](PLAN.md). GATE 1: approved by the orchestrator. Open questions resolved:
   - no `--dry-run --json` key;
   - a thrown validation error's reason is its first sentence, escaped and capped at 200 chars with an ellipsis, tested;
   - the cross-module integration case is in scope.
2. `/pharn-dev-grill` → [GRILL.md](GRILL.md), advisory: 4 concerns (0 blocking, 1 important, 3 minor). Applied in the build:
   - the tests pin the summary note before both `select` and `confirm`, and assert no prompt under `--yes`;
   - `docs/reference/pharn-config.md` says only `init` restores `modules`.
3. `/pharn-dev-build`. Build note:
   - `readPharnConfig`'s guard reads a config iff it has a string `skillsVersion` and either a `modules` array or a `capabilities` key.
   - `readPreviousConfig` returns `unreadable`: a validation error's first sentence (without its period), escaped and capped, or fixed text for a `null` read of a file that exists.
   - `previousConfigLines` prints the line in the summary of the real run, `--yes` and the text dry run.
   - `PharnConfig.modules` is now optional on read. Every "0.3.0–0.12.0" became "0.3.0–0.19.x".
   - One existing test row changed its premise: in `init-archetype.test.ts`, "keeps them from a config that every other command refuses" used no-`modules` as the refused shape and now uses no-`skillsVersion`.
   - The 23 new tests fail against the pre-change src.
   - Committed as `f77bf65`.
4. `/pharn-dev-regress` → [regression-report.json](regression-report.json), [REGRESSION.md](REGRESSION.md).
5. `/pharn-dev-verify` → [verify-report.json](verify-report.json), [VERIFY.md](VERIFY.md).
6. `/pharn-dev-review` → [REVIEW.md](REVIEW.md), advisory: 0 floor-gate findings and 4 advisory ones. The comment-wrap finding was fixed at GATE 2 (comment only).

Ended at: GATE 2. The decision rule delegated by the orchestrator was applied: regress and verify are green and review has no blocking finding, so the decision is "ship" (commit, push, PR, no merge).

## Structural verdicts, verbatim

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**; `CI=1 npm run check` exit **0** (3688 passed, 1 skipped).
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **"no-regressions"**.
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **"PASS"**, `failing_gates: []`.

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
