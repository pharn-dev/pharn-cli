# REGRESSION — core-180-one-error-type

- base: `790d9c39b33f80083ed5cfff5899a575542f71b0`, origin/main, where the branch forked. head: commit `239fb25`, the build commit.
- inside: the changed scope, 36 paths, all within the PLAN's `## Files` (`scope` exited 0, so no path escaped it). It holds:
  - `src/` commands, steps and lib; `src/lib/cli-error.ts` (new) and `src/lib/confirm.ts` (deleted);
  - `eslint.config.mjs`;
  - `tests/` (rewritten and new suites, plus `tests/support/exit-code.ts`);
  - `docs/architecture.md`, `docs/contributing.md`, `docs/troubleshooting.md`, `CLAUDE.md` and `CHANGELOG.md`.
    The stage artifacts under `.dev/features/core-180-one-error-type/` were left out of `--changed`, as in earlier features.
- outside gates, identical at base and head:
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs` files;
  - `validate`;
  - the style gates `lint`, `format:check` and `lint:md`, which run because `eslint.config.mjs`, a shared style config, changed.
    The baseline ran in a `git archive` export of the base with `node_modules` linked. The lockfile is unchanged, so the dependency tree is the same.

| gate         | base | head |
| ------------ | ---- | ---- |
| tests        | 0    | 0    |
| validate     | 0    | 0    |
| lint         | 0    | 0    |
| format:check | 0    | 0    |
| lint:md      | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict from `check-regress.mjs`, verbatim: **no-regressions**. That means no breakage the outside suite can detect deterministically. It covers only what that suite covers and does not claim that nothing broke. The vitest suite is gated separately, by `/pharn-dev-build`'s `npm run check` and by `/pharn-dev-verify`. The build run of `npm run check` was GREEN: 100 files, 3422 passed, 1 skipped.
