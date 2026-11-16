# REGRESSION — core-192-claude-md-trim

- base: `a4bbcb93335b85969f24b18de8f27e13aeb14d59`, which is `git merge-base HEAD origin/main` (the tree was clean
  apart from this feature's own untracked stage artifacts)
- machine report: `.dev/features/core-192-claude-md-trim/regression-report.json` (`check-regress.mjs verdict`, verbatim)

## Partition

- inside (93):
  - 88 `src/**/*.ts` files (comment-only)
  - `CLAUDE.md`, `CONTRIBUTING.md`, `docs/README.md`, `docs/architecture.md`, `docs/contributing.md`
  - this feature's `PLAN.md` and `GRILL.md`
- declared writes: the PLAN's `## Files` plus each stage's own artifacts. `check-regress.mjs scope` exited 0 and
  `escaped` is `[]`.
- outside gates:
  - `tests` = `node --test` over the 47 tracked `*.test.mjs` / `*.test.cjs` files (hooks and `.dev/floor`)
  - `validate` = `node .dev/floor/validate.mjs .`
  - there are no committed eval pairs
  - the style gates were skipped, because the feature touches no shared style config
- Both sides ran in clean checkouts with no gitignored `test-*/` trees. The base ran in a fresh
  `git worktree add --detach`, removed afterwards, and the head ran in this feature worktree.

## Gates

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Both runs had 787 tests, all passing.

- regressions: none
- pre_existing: none

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

This compares exit codes of the existing suite at the base and at HEAD, so it catches what that suite catches and
nothing more. The vitest suite (`tests/*.test.ts`) covers the changed `src/` files, so it is inside the changed scope
and runs at `/pharn-dev-verify`. `npm run check` and the build passed at HEAD during the build stage. The token check
also found every `src/` file token-identical to the base.
