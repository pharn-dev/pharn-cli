# REGRESSION — retire-legacy-lock

- base: `df1fc929287a50d119f982870ceb61d832c79a3a` (origin/main, v0.19.0). head: the working tree of the build.
- inside: the changed scope, 14 paths, all within the PLAN's `## Files` (`scope` exited 0, `escaped` empty):
  - `src/` (`lib/project-lock.ts`, `lib/backup.ts`, `lib/root-migration.ts`, `commands/init.ts`,
    `commands/update.ts`, `steps/install-archetype.ts`);
  - `tests/` (`project-lock`, `backup`, `root-migration`, `commands/update`), rewritten in place or extended;
  - `docs/troubleshooting.md`, `docs/commands/update.md`, `README.md`, `CHANGELOG.md`.
    The stage artifacts under `.dev/features/retire-legacy-lock/` were left out of `--changed`, as in earlier features.
- outside gates, identical at base and head:
  - `tests`: `node --test` over the 47 outside `*.test.mjs`/`*.test.cjs` files (787 tests on each side);
  - `validate`.
    No shared style config changed, so the style gates were skipped on both sides. The baseline ran in a
    `git archive` export of the base with `node_modules` linked; the lockfile is unchanged.

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

Regressions: none. Pre-existing failures: none.

Verdict from `check-regress.mjs`, verbatim: **no-regressions**. That means no breakage the outside suite can detect
deterministically. It covers only what that suite covers and does not claim that nothing broke. The vitest suite is
gated separately, by `/pharn-dev-build`'s `npm run check` and by `/pharn-dev-verify`. The build run of `npm run check`
was GREEN with `CI=1`: 103 files, 3653 passed, 1 skipped.
