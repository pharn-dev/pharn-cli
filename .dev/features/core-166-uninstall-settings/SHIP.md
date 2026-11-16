# SHIP — core-166-uninstall-settings (Linear CORE-166)

Stages run, in order (gated mode):

1. `/pharn-dev-plan` → `PLAN.md`. GATE 1: approved by the orchestrator (the user delegated the decision),
   with the three listed choices, plus one added check: a dropped settings record must not make an
   otherwise-unchanged locked re-plan loop or ask on every run.
2. `/pharn-dev-grill` → `GRILL.md` (advisory: 0 blocking, 1 important, 2 minor; the important one is the
   same check GATE 1 asked for, built in step 3).
3. `/pharn-dev-build` → the plan's `## Files`, plus `tests/init-archetype.test.ts` (found at build: two
   cases pinned the old "never recorded" contract; declared in `## Files` and re-scoped before editing).
   Floor: `node .dev/floor/validate.mjs .` exit **0**; `CI=1 npm run check` GREEN (3684 passed, 1 skipped).
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`**.
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (test, validate, lint, format:check,
   lint:md, typecheck all 0; no verifiers registered).
6. `/pharn-dev-review` → `REVIEW.md` (0 floor-gate findings, 1 advisory). After it, two comment-only
   line wraps in `src/commands/uninstall.ts` and `src/lib/install-records.ts`; the pre-push full check
   re-covers them.

Where the run ended: GATE 2. Decision rule delegated by the orchestrator: regress and verify GREEN and no
blocking review finding → ship (commit code + these artifacts, push, open the PR).

Build note: a fresh `init` now records `.claude/settings.json` when it wrote it (`settingsWritten`);
`update` and a re-run `init` carry that record through `carriedSettingsRecord` while something is at
the path; `add`/`remove` keep it unchanged; `findMissingInstalled` skips the key; `planUninstall` admits
exactly that key and classifies it like any other, so `uninstall` deletes it when hash-equal, keeps and
lists it when edited, and `.claude/` goes when empty; the UNTOUCHED line names the file only when it has
no record. `isInstallRootPath` is unchanged.

Rebased onto origin/main @ b0f9954 (CORE-163) before pushing: CHANGELOG and one integration-test hunk
conflicted (both sides kept); `CI=1 npm run check` GREEN again (3690 passed, 1 skipped).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
