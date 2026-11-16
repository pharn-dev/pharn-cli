# REGRESSION — core-184-parseargs

- base: `790d9c39b33f80083ed5cfff5899a575542f71b0` (`HEAD` = `origin/main`; the build is uncommitted in the working
  tree, so `base = HEAD`)
- machine report: `.dev/features/core-184-parseargs/regression-report.json` (`check-regress.mjs verdict`, verbatim)

## Partition

- inside (21): `src/index.ts`, `src/lib/cli-args.ts`, `tests/cli-args.test.ts`, `tests/index.test.ts`,
  `tests/dist-smoke.test.ts`, `package.json`, `package-lock.json`, `scripts/build.mjs`, `CHANGELOG.md`, `CLAUDE.md`,
  `SECURITY.md`, `docs/architecture.md`, `docs/commands/init.md`, `docs/commands/list.md`, `docs/commands/status.md`,
  `docs/commands/update.md`, `docs/troubleshooting.md`, and this feature's `PLAN.md`, `GRILL.md`, `REGRESSION.md` and
  `regression-report.json`.
- iteration 2: re-run after two stale doc sentences (`list.md`, `status.md`) found at verify were fixed; the
  partition, gates and verdict below are this second run's.
- declared writes: the PLAN's `## Files` plus each stage's own artifacts. `check-regress.mjs scope` exited 0 and
  `escaped` is `[]`.
- outside gates:
  - `tests` = `node --test` over the 47 tracked `*.test.mjs` / `*.test.cjs` files (hooks and `.dev/floor`)
  - `validate` = `node .dev/floor/validate.mjs .`
  - there are no committed eval pairs
  - the style gates were skipped: the feature touches no shared style config (prettier, eslint, markdownlint)
- The base ran in a fresh `git worktree add --detach`, removed afterwards; the head ran in this feature worktree.

## Gates

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

- regressions: none
- pre_existing: none

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

This compares exit codes of the existing suite at the base and at HEAD, so it catches what that suite catches and
nothing more. The vitest suite (`tests/*.test.ts`) covers the changed `src/` files, so it is inside the changed scope
and runs at `/pharn-dev-verify`. `npm run check` (3,405 tests) and `npm run build` passed at HEAD during the build
stage.
