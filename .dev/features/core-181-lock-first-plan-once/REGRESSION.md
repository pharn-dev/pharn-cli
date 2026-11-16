# REGRESSION — core-181-lock-first-plan-once

- base: `8e38bf7e44dfee97f4e0ca537a5a7dfbb3b26770` (origin/main, where the branch forked). head: commit `89087118`, the build commit.
- inside: the changed scope, 48 paths, all within the PLAN's `## Files` (`scope` exited 0, `escaped` empty):
  - `src/` commands, steps and lib (21 files);
  - `tests/` (18 files, rewritten in place or extended);
  - `docs/architecture.md`, `docs/troubleshooting.md`, `docs/commands/{add,init,remove,uninstall,update}.md`,
    `CLAUDE.md` and `CHANGELOG.md`.
    The stage artifacts under `.dev/features/core-181-lock-first-plan-once/` were left out of `--changed`, as in earlier features.
- outside gates, identical at base and head:
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs` files (787 tests at head);
  - `validate`.
    No shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`)
    changed, so the style gates were skipped on both sides. The baseline ran in a `git archive` export of the base with
    `node_modules` linked; the lockfile is unchanged.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict from `check-regress.mjs`, verbatim: **no-regressions**. That means no breakage the outside suite can detect
deterministically. It covers only what that suite covers and does not claim that nothing broke. The vitest suite is
gated separately, by `/pharn-dev-build`'s `npm run check` and by `/pharn-dev-verify`. The build run of `npm run check`
was GREEN: 104 files, 3530 passed, 1 skipped (also with `CI=1`).
