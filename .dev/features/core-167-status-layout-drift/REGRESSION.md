# REGRESSION — core-167-status-layout-drift

- base: `688a838052bccded07443b736aa08e7afeada7e7`. The build is uncommitted in the worktree, so `base = HEAD` by the Step 1 rule; it is also origin/main. head: the working tree.
- inside: every changed path is in the PLAN's `## Files`, and `scope` exited 0 with nothing escaped: CHANGELOG.md, CLAUDE.md, docs/commands/status.md, src/commands/status.ts, src/lib/status-report.ts, tests/{status-json,status-report,status}.test.ts.
- The pipeline's own artifacts under `.dev/features/core-167-status-layout-drift/` were left out of `--changed`, as in core-162 and core-173. Each stage wrote its artifact under its own hook scope.
- outside gates (the same set at base and head):
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs` files (787 tests).
  - `validate`: `node .dev/floor/validate.mjs <root>`.
  - No committed eval pairs. Style gates were skipped because no shared style config changed.
- The baseline ran from a fresh `git worktree add --detach` checkout at the base, which was removed afterwards. The worktree isolation forbids a `cd` there, so the baseline gates were run with absolute paths into that checkout: `node --test <checkout>/…` and `validate.mjs <checkout>`.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. This catches only what the outside suite covers; it is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `npm run check` (GREEN with `CI=1`: 109 files, 3670 passed, 1 skipped) and by `/pharn-dev-verify`.
