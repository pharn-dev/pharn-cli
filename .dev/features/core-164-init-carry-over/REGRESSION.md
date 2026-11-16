# REGRESSION — core-164-init-carry-over

- base: `688a838052bccded07443b736aa08e7afeada7e7` (`git merge-base HEAD origin/main`). The working tree was clean after the feature commit `f77bf65`, so by the Step 1 rule the base is the fork point, which is also origin/main. head: `f77bf65`.
- inside: the changed scope, all within the PLAN's `## Files`.
  - CHANGELOG.md, CLAUDE.md
  - docs/commands/init.md, docs/reference/pharn-config.md
  - src/commands/init.ts
  - src/lib/{init-plan,pharn-config}.ts
  - src/steps/{archetype-summary,install-archetype}.ts
  - src/types.ts
  - tests/{archetype-summary,commands-integration,init-archetype,init-dry-run,init-report,pharn-config}.test.ts
- The pipeline's own stage artifacts under `.dev/features/core-164-init-carry-over/` (untracked) were left out of `--changed`, as in core-158/159. `scope` returned exit 0 with nothing escaped.
- outside gates (identical at base and head):
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`, run with `${=OUT}`. 787 tests passed on each side.
  - `validate`: `node .dev/floor/validate.mjs .`.
- The baseline ran in a fresh `git worktree add --detach` checkout of the base, removed afterwards. No committed eval pairs were passed. The style gates were skipped because no shared style config changed.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none, meaning no deterministically detectable breakage outside the feature. This catches only what the outside suite covers; it is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `CI=1 npm run check` (GREEN: 3688 passed, 1 skipped) and by `/pharn-dev-verify`.
