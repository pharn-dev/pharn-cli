# REGRESSION — core-191-pinning-tests-to-lint

- base: `a4bbcb93335b85969f24b18de8f27e13aeb14d59` (origin/main, the branch's fork point). head: commit `d8cebe8` (the build commit).
- inside (the changed scope, all within the PLAN's `## Files`): `eslint.config.mjs`, `docs/contributing.md`, `docs/RELEASING.md`, and `tests/` — `lint-rules` (new); `ci-workflow`, `publish-workflow`, `dependency-overrides` (rewritten); `check-composition`, `dev-script`, `docs-install-tables`, `docs-models-claims`, `lint-gate` (deleted); `color`, `diff`, `engines`, `executable-unit`, `hash`, `init`, `json-report`, `remove`, `report-error`, `root-migration`, `symlink-guard`, `tar-extract`, `terminal-safe`, `update` (whole blocks removed). The stage artifacts under `.dev/features/core-191-pinning-tests-to-lint/` were left out of `--changed`, as in earlier features. `scope` exited 0 with nothing escaped.
- outside gates (identical at base and head): `tests` (`node --test` over the 47 outside `*.test.mjs`/`*.test.cjs`; 787 pass, 0 fail on both sides) and `validate`, plus the style gates `lint`, `format:check` and `lint:md`, because `eslint.config.mjs` (a shared style config) changed. The baseline ran in a `git archive` export of the base with `node_modules` linked (the lockfile is unchanged, so the dependency tree is the same).

| gate         | base | head |
| ------------ | ---- | ---- |
| tests        | 0    | 0    |
| validate     | 0    | 0    |
| lint         | 0    | 0    |
| format:check | 0    | 0    |
| lint:md      | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**. REGRESSIONS: none, meaning no deterministically detectable breakage outside the feature. This catches only what the outside suite covers; it is not a claim that nothing broke. The vitest suite is gated by `/pharn-dev-build`'s `npm run check` (GREEN: 105 files, 3667 passed, 1 skipped) and by `/pharn-dev-verify`.
