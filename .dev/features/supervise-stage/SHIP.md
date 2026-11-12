# SHIP — supervise-stage

Gated `/pharn-dev-ship` run (no `--loop`), in the external worktree
`pharn-cli-worktrees/supervise-0183` on branch `fix/supervise-stage-0183` (from `origin/main` @
`b14cf221`). Ended at **GATE 2**, the human's merge / fix / abandon decision.

## Stages, in order

1. `/pharn-dev-plan` → `PLAN.md`, re-verifying a prior session's draft live (pharn-oss `5568d4ce`,
   7.10.2). **GATE 1:** approved as written by the maintainer, 2026-11-12, version 0.18.3.
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 0 blocking-severity, 1 important, 2 minor). The
   important one (say what an older pharn does with the key, not "refuses") and the minor docs one
   (frame the supervisor's decision as advisory) were addressed in the build.
3. `/pharn-dev-build` → floor: `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN`);
   `npm run check` exit 0. The new tests failed before the one-line source change and passed after.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`** (base
   `b14cf221`; baseline from a `git archive` export, see `REGRESSION.md`).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`); also
   `npm run build` exit 0 and `CI=1` vitest exit 0.
6. `/pharn-dev-review` → `REVIEW.md` (advisory; see it for the findings — not restated here).

## What landed

`supervise` in `PRODUCT_STAGES` (after `triage`); the vendored checker refreshed byte-for-byte to
pharn-oss `5568d4ce` (7.10.2) and re-pinned (`frontmatter-core.mjs` unchanged); stage-enumerating
tests; the reference doc, README and getting-started; `KNOWN_TAGS` += `v0.18.2`; CHANGELOG `0.18.3`
and the version bump. pharn-oss `MIN_CLI` needs no change (its own block names no `supervise` key).

Not committed. `.pharn/writes-scope.json` (tracked) carries this run's scope and must be restored
(`git restore .pharn/writes-scope.json`) before any commit.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
