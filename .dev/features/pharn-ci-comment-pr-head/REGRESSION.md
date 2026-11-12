# REGRESSION — pharn-ci-comment-pr-head

- base: `f83b736a98867eed28c12f6d164189627e4be0e1` (origin/main, 0.18.3); head: `3199ca6`
- Both trees were captured with `git archive` into the session scratchpad (clean checkouts, no
  gitignored `test-*/` fixtures). `git worktree add` was not used.

## Partition

- inside (the declared `## Files`): `.github/workflows/ci.yml`, `.github/workflows/pharn-ci-comment.yml`,
  `CHANGELOG.md`, `tests/ci-workflow.test.ts`. No path escaped the declared writes (`scope` exit 0).
  The feature's own pipeline artifacts under `.dev/features/pharn-ci-comment-pr-head/` and the
  `.pharn/` scratch are excluded, as in earlier features.
- outside: 46 `*.test.mjs` / `*.test.cjs` files (`node --test`), whole-repo `validate`. No committed
  eval pairs. No shared style config was touched, so the style gates were skipped on both sides.

## Gates (exit codes)

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

regressions: none · pre_existing: none

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what these gates catch, nothing more. The changed workflows themselves
are exercised only on GitHub. Their in-repo pin is the vitest `tests/ci-workflow.test.ts` (inside the
feature, run by `/pharn-dev-verify`).
