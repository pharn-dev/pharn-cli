# REGRESSION — release-tag-ref

- base: `95426567c2197a0dc4807382287c44b1a1385077` (clean tree, so `base = git merge-base HEAD origin/main`; the increment is commit `55fae47` on `fix/release-tag-ref`)
- machine report: `.dev/features/release-tag-ref/regression-report.json` (`check-regress.mjs verdict`, verbatim)

## Partition

- inside (19): the eleven product/test/doc paths in the PLAN's `## Files` (`src/lib/release.ts`, `src/lib/repo.ts`, five test files, `package.json`, `package-lock.json`, `CHANGELOG.md`, `CLAUDE.md`), plus the eight `.dev/features/release-tag-ref/` stage artifacts.
- declared writes: the PLAN's `## Files` paths, plus the stage artifacts other than PLAN.md. Each of those is its stage's own declared `writes:`, written under that stage's scope. `check-regress.mjs scope` exited 0 (nothing escaped).
- outside gates:
  - `tests` = `node --test` over the 47 tracked `*.test.mjs` / `*.test.cjs` files outside the inside set
  - `validate` = `node .dev/floor/validate.mjs .`
  - no committed eval pairs
  - style gates skipped (no shared style config inside)
- Both sides ran in clean checkouts: base in a fresh `git worktree add --detach`, head in this feature worktree. Neither has gitignored `test-*/` trees.

## Gates

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

- regressions: none
- pre_existing: none

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

This compares exit codes of the existing suite at the base and at HEAD. It catches what that suite catches, nothing more. The vitest suite (`tests/*.test.ts`), where this increment's behaviour is tested, is inside the changed scope and is run by `/pharn-dev-verify`.
