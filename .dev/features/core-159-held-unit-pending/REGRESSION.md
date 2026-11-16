# REGRESSION — core-159-held-unit-pending

- base: `991b229bc5fcbfc398d24cc0fb67dbd56f59e585` (origin/main, the branch's fork point). head: `79abf0d` (the build commit). Both were captured in fresh `git worktree add --detach` checkouts in the scratchpad, so no gitignored local fixture could colour either side.
- inside (the changed scope, all within the PLAN's `## Files`): CHANGELOG.md, CLAUDE.md, docs/commands/{add,update}.md, docs/reference/pharn-config.md, src/commands/{add,update}.ts, src/lib/{update-decision,update-plan,update-render,update-report}.ts, src/types.ts, tests/{add,commands-integration,update-decision,update-dry-run-json,update-plan,update-render,update-report}.test.ts.
- `scope` returned exit 0 with nothing escaped. The pipeline's own stage artifacts under `.dev/features/core-159-held-unit-pending/` were left out of `--changed`, as in earlier features; each stage wrote them under its own hook scope.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`) and `validate` (`node .dev/floor/validate.mjs .`). No committed eval pairs were passed. Style gates were skipped because no shared style config changed.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none, meaning no deterministically detectable breakage outside the feature. This catches only what the outside suite covers. It is not a claim that nothing broke. The vitest suite, which covers the CLI itself, is gated by `/pharn-dev-build`'s `npm run check` (GREEN, 3618 passed, 1 skipped) and by `/pharn-dev-verify`.
