# REGRESSION — core-168-init-add-small-fixes

- base: `688a838052bccded07443b736aa08e7afeada7e7` (origin/main, the branch's fork point; passed as `--base`). head: commit `fc898d2` (the build commit).
- inside (the changed scope, all within the PLAN's `## Files`): CHANGELOG.md, CLAUDE.md, docs/commands/{add,init}.md, docs/troubleshooting.md, src/commands/{add,init}.ts, src/lib/{format,init-report,resolve-capabilities,write-targets}.ts, src/steps/{add-picker,prereqs}.ts, tests/{add,archetype-summary,format,init-dry-run,init-report,init-yes,init,merge-capabilities,prereqs,resolve-capabilities,write-targets}.test.ts.
- The pipeline's own stage artifacts under `.dev/features/core-168-init-add-small-fixes/` were left out of `--changed`, as in earlier features. `scope` returned exit 0 with nothing escaped.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`; 787 pass, 0 fail on both sides) and `validate` (`node .dev/floor/validate.mjs .`). The baseline ran in a `git archive` export of the base (the isolated worktree cannot add a second worktree); the outside files are byte-identical to the base's. No committed eval pairs were passed. Style gates were skipped because no shared style config changed.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none, meaning no deterministically detectable breakage outside the feature. This catches only what the outside suite covers. It is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `npm run check` (GREEN, 3681 passed, 1 skipped) and by `/pharn-dev-verify`.
