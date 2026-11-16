# REGRESSION — core-182-update-always-plans

- base: `0f90e6fd9e29c8b1a3da58a91ee9f64cd469a9e8` (origin/main, where the branch forked). head: commit `3aa4eea6` (the build commit `27d96ef0` plus the review's
  layout-move test; both heads measured, both `no-regressions`).
- inside: the changed scope, 34 paths, all within the PLAN's `## Files` (`scope` exited 0, `escaped` empty):
  - `src/` commands and lib (14 files, two of them deleted: `missing-installed.ts`, `agent-surface.ts`);
  - `tests/` (14 files, two of them deleted: `missing-installed.test.ts`, `agent-surface.test.ts`);
  - `docs/architecture.md`, `docs/troubleshooting.md`, `docs/commands/{add,remove,status,update}.md`, `CLAUDE.md`
    and `CHANGELOG.md`.
    The stage artifacts under `.dev/features/core-182-update-always-plans/` were left out of `--changed`, as in earlier features.
- outside gates, identical at base and head:
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs` files (787 tests on both sides);
  - `validate`.
    No shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`)
    changed, so the style gates were skipped on both sides. The baseline ran in a `git archive` export of the base with
    `node_modules` linked; the lockfile is unchanged.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict from `check-regress.mjs`, verbatim: **no-regressions**. REGRESSIONS: none — no deterministically-detectable
breakage outside the feature. It covers only what that outside suite covers and does not claim that nothing broke. The
vitest suite is gated separately, by `/pharn-dev-build`'s `npm run check` and by `/pharn-dev-verify`. The build run of
`npm run check` was GREEN with `CI=1`: 102 files, 3497 passed, 1 skipped; `npm run build` and `npm run test:coverage`
(98.28 / 95.47 / 99.18 / 98.86) green.
