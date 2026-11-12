# SHIP — release-0184

Gated `/pharn-dev-ship` run (no `--loop`), in the external worktree
`pharn-cli-worktrees/release-0184` on branch `chore/release-0184` (from `origin/main` @ `6ca4634`,
after #357 and #358). Ends at **GATE 2**, the user's merge / fix / abandon decision. Merging this PR
is the release: `publish.yml` publishes 0.18.4 to npm and creates the `v0.18.4` GitHub release.

## Stages, in order

1. `/pharn-dev-plan` → `PLAN.md`. **GATE 1:** approved as written by the user, 2026-11-12.
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 0 blocking-severity, 0 important, 2 minor). Both
   (name the lockfile and tsconfig in the unchanged-CLI check; keep the #358 entry clearly
   contributor-facing) were folded into the build.
3. `/pharn-dev-build` → floor: `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN`);
   `npm run check` exit 0.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`** (base
   `6ca4634`; baseline from a `git archive` export, see `REGRESSION.md`).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`); also
   `npm run build` exit 0 (`dist/index.js --version` → `0.18.4`) and `CI=1` vitest exit 0.
6. `/pharn-dev-review` → `REVIEW.md` (advisory; see it for the findings — not restated here).

## What landed

`CHANGELOG.md`: `## [0.18.4] — 2026-11-12` with a lead line that the published CLI is unchanged
apart from its version, #357's existing `### Changed` entry, and a new one for #358; empty
`[Unreleased]`; compare links. `KNOWN_TAGS` += `v0.18.3`. Version 0.18.4 in `package.json` and
`package-lock.json`. `.pharn/` runtime files are untracked since #358, so nothing needed restoring.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
