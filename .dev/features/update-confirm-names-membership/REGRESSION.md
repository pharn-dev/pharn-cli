# REGRESSION — update-confirm-names-membership

Base: `d7f448236d8412cdca7d3922931d9431d017ad9d`, which is `git merge-base HEAD origin/main`, the fork point after #297.
HEAD: `ee707fa`, the build commit. Both sides were captured in fresh detached worktrees, so the gitignored `test-*/` fixtures were absent on both.

## Partition

Inside (6 files): `CHANGELOG.md`, `CLAUDE.md`, `docs/commands/update.md`, `src/commands/update.ts`, `tests/project-lock-commands.test.ts`, `tests/update.test.ts`.

- All 6 are within the plan's declared `## Files`; `check-regress.mjs scope` exited 0, so nothing escaped.
- Orchestration note (advisory): `.pharn/writes-scope.json` (scratch) and `.dev/features/update-confirm-names-membership/*` (this loop's own artifacts) were left out of `--changed`, as in earlier features.

## Gates outside the feature: exit code at base and head

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

- `tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files under `.claude/hooks/` and `.dev/floor/` (756 tests on each side).
- There are no committed eval pairs.
- The style gates were skipped because no shared style config changed.
- The vitest suite is covered by `/pharn-dev-verify`.

REGRESSIONS: none. No deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
