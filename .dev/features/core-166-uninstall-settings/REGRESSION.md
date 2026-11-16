# REGRESSION — core-166-uninstall-settings

- base: `688a838052bccded07443b736aa08e7afeada7e7`. The build is an uncommitted working-tree build in the
  worktree, so `base = HEAD` by the Step 1 rule; it is also origin/main. head: the working tree.
- inside (the changed scope, all within the PLAN's `## Files`): CHANGELOG.md, CLAUDE.md,
  docs/commands/{init,uninstall,update}.md, docs/reference/pharn-records.md, docs/troubleshooting.md,
  src/commands/uninstall.ts, src/lib/{install-records,missing-installed,uninstall-plan,update-next,update-plan}.ts,
  src/steps/install-archetype.ts,
  tests/{commands-integration,init-archetype,install-records,missing-installed,orphans,uninstall-plan,uninstall,update-next,update-plan}.test.ts.
- The pipeline's own stage artifacts under `.dev/features/core-166-uninstall-settings/` were left out of
  `--changed`, as in core-158/170/171/173. `scope` returned exit 0 with nothing escaped.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside
  `*.test.mjs`/`*.test.cjs`) and `validate` (`node .dev/floor/validate.mjs .`). The baseline ran in a fresh
  `git worktree add --detach` checkout of the base. No committed eval pairs were passed. Style gates were
  skipped because no shared style config changed.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none — no deterministically
detectable breakage outside the feature. This catches only what the outside suite covers; it is not a
claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s
`CI=1 npm run check` (GREEN, 3684 passed, 1 skipped) and by `/pharn-dev-verify`.
