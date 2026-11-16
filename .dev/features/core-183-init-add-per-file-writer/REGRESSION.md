# REGRESSION — core-183-init-add-per-file-writer

- base: `790d9c39b33f80083ed5cfff5899a575542f71b0` (origin/main, the branch's fork point). head: `597b35f` (the build commit `6a9fb35`
  plus two review follow-ups; head gates re-run there).
- inside (the changed scope, exactly the PLAN's `## Files`; `scope` exited 0, nothing escaped): `src/lib/apply-update.ts`,
  `src/lib/install-capabilities.ts`, `src/lib/dest-drift.ts`, `src/lib/install-manifest.ts`,
  `src/steps/install-archetype.ts`, `src/commands/add.ts`, `src/commands/update.ts`, `eslint.config.mjs`, seven test
  files, `CLAUDE.md`, four `docs/` pages and `CHANGELOG.md`. The stage artifacts under this feature dir were left out of
  `--changed`, as in earlier features.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`) and
  `validate`, plus the style gates `lint`, `format:check` and `lint:md`, because `eslint.config.mjs` (a shared style
  config) changed. The baseline ran in a `git archive` export of the base with `node_modules` linked (the lockfile is
  unchanged).

| gate         | base | head |
| ------------ | ---- | ---- |
| tests        | 0    | 0    |
| validate     | 0    | 0    |
| lint         | 0    | 0    |
| format:check | 0    | 0    |
| lint:md      | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none — no deterministically-detectable breakage
outside the feature. This catches only what the outside suite covers; it is not a claim that nothing broke. The vitest
suite is gated by `/pharn-dev-build`'s `npm run check` (GREEN: 98 files, 3404 passed, 1 skipped) and by
`/pharn-dev-verify`.
