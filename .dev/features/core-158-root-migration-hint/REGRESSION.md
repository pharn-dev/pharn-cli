# REGRESSION — core-158-root-migration-hint

- base: `991b229bc5fcbfc398d24cc0fb67dbd56f59e585`. The build is an uncommitted working-tree build in the worktree, so `base = HEAD` by the Step 1 rule. It is also origin/main. head: the working tree.
- inside (the changed scope, all within the PLAN's `## Files`): CHANGELOG.md, CLAUDE.md, README.md, docs/commands/update.md, src/commands/{init,update}.ts, src/lib/{backup,init-plan,root-migration,update-plan,update-render,update-report}.ts, src/steps/install-archetype.ts, tests/{backup,commands-integration,root-migration,update-plan,update-render,update-report}.test.ts.
- The pipeline's own stage artifacts under `.dev/features/core-158-root-migration-hint/` were left out of `--changed`, as in core-170/171/173. `scope` returned exit 0 with nothing escaped.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`, passed with `${=OUT}`) and `validate` (`node .dev/floor/validate.mjs .`). The baseline ran in a fresh `git worktree add --detach` checkout of the base. The head worktree has no gitignored `test-*/` fixture dirs. No committed eval pairs were passed. Style gates were skipped because no shared style config changed.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none, meaning no deterministically detectable breakage outside the feature. This catches only what the outside suite covers. It is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `npm run check` (GREEN, 3605 passed, 1 skipped) and by `/pharn-dev-verify`.
