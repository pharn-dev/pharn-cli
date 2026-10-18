# REGRESSION — detect-truncation-and-allowlists

Base: `a405e69de28426e5a8620228e6a8a74d4dd38046` (`git merge-base HEAD origin/main`; the build is
committed as `4e239f4` on `fix/detect-truncation-and-allowlists`). Both sides ran in fresh detached
worktrees (base at `a405e69`, head at `4e239f4`), so gitignored local fixtures cannot colour either
result.

## Partition

Inside (18 product files, all within the plan's declared `## Files`; `check-regress.mjs scope` exit 0,
`escaped` empty): `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/commands/init.md`,
`docs/getting-started.md`, `docs/troubleshooting.md`, `src/commands/init.ts`, `src/lib/archetype.ts`,
`src/lib/detect-archetype.ts`, `src/lib/init-plan.ts`, `src/lib/init-report.ts`,
`src/steps/archetype-summary.ts`, `tests/archetype-summary.test.ts`, `tests/archetype.test.ts`,
`tests/detect-archetype.test.ts`, `tests/init-dry-run-json.test.ts`, `tests/init-report.test.ts`,
`tests/init.test.ts`.

Orchestration note (advisory): `.pharn/**` (scratch) and `.dev/features/detect-truncation-and-allowlists/*`
(the loop's own artifacts) were left out of `--changed`, as in earlier features.
`tests/init-dry-run.test.ts` is declared but did not need a change.

## Gates (outside the feature): base → head exit code

| gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |

`tests` = `node --test` over the 46 outside `.test.mjs`/`.test.cjs` files. No committed eval pairs.
Style gates were skipped (no shared style config changed). The vitest suite is covered by
`/pharn-dev-verify`.

Iteration 2 (head `17ac899`, after the docs-only fix to `docs/commands/init.md`; same base, same gate
set, fresh detached worktree): `tests` 0 → 0, `validate` 0 → 0.

REGRESSIONS: none — no deterministically-detectable breakage outside the feature.

Residual: this catches exactly what the suite above catches, nothing more.
