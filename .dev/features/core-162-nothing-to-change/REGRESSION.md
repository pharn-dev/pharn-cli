# REGRESSION — core-162-nothing-to-change

- base: `991b229bc5fcbfc398d24cc0fb67dbd56f59e585`. The build is uncommitted in the worktree, so `base = HEAD` by the Step 1 rule; it is also origin/main. head: the working tree.
- inside: every changed path is in the PLAN's `## Files`, and `scope` exited 0 with nothing escaped. The paths are CHANGELOG.md, CLAUDE.md, docs/commands/update.md, src/commands/update.ts, src/lib/{install-records,update-next,update-plan,update-render,update-report}.ts, and tests/{commands-integration,install-records,update-dry-run,update-next,update-render,update-report,update}.test.ts.
- The pipeline's own artifacts under `.dev/features/core-162-nothing-to-change/` were left out of `--changed`, as in core-173. Each stage wrote its artifact under that stage's own hook scope.
- outside gates (identical at base and head):
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs` files, passed with `${=T}`.
  - `validate`: `node .dev/floor/validate.mjs .`.
  - No committed eval pairs. Style gates were skipped because no shared style config changed.
- The baseline ran in a fresh `git worktree add --detach` checkout at the base, removed afterwards.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. This catches only what the outside suite covers; it is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `npm run check` (GREEN, 3642 passed, 1 skipped) and by `/pharn-dev-verify`.
