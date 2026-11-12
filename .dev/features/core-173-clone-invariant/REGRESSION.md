# REGRESSION — core-173-clone-invariant

- base: `8fe3d5a7770d5c5e3184e3491028aa8c609837e7`. The build is an uncommitted working-tree build in the worktree, so `base = HEAD` by the Step 1 rule; it is also origin/main. head: the working tree.
- inside (the changed scope, all within the PLAN's `## Files`): CHANGELOG.md, CLAUDE.md, SECURITY.md, src/lib/{capability-index,dest-drift,hook-wiring,install-capabilities,install-manifest,repo,skills-version,tar-extract}.ts, tests/{capability-index,dest-drift,hook-wiring,install-capabilities,install-manifest,tar-extract}.test.ts.
- The pipeline's own stage artifacts under `.dev/features/core-173-clone-invariant/` (PLAN, GRILL, and this report) were left out of `--changed`, as in core-170/171. `/pharn-dev-plan` and `/pharn-dev-grill` wrote them under their own hook scopes. `scope` returned exit 0 with nothing escaped.
- `THREAT-MODEL.md` is declared but not yet changed: it is hook-protected, and its patch script is for the human to run.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`, passed with `${=OUT}`) and `validate` (`node .dev/floor/validate.mjs .`). No committed eval pairs were passed. Style gates were skipped because no shared style config changed.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none, meaning no deterministically detectable breakage outside the feature. This catches only what the outside suite covers. It is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `npm run check` (GREEN, 3603 passed) and by `/pharn-dev-verify`.
