# REGRESSION — init-manual-carry

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `f9b1bbb397ec7b659b99a8e7bfc0847ebe9976d5` (`origin/main` after #214 and #215, merged into this
  branch while its PR was open). Re-run after that merge; the first run, against `5cf6ce3` (`origin/main`
  after #213), gave the same verdict.
- **inside** (each declared in `PLAN.md` `## Files`): `src/commands/init.ts`, `src/lib/pharn-config.ts`,
  `src/steps/install-archetype.ts`, `src/steps/archetype-summary.ts`, `src/types.ts`, `tests/init.test.ts`,
  `tests/init-archetype.test.ts`, `tests/archetype-summary.test.ts`, `tests/pharn-config.test.ts`,
  `docs/commands/init.md`, `docs/reference/pharn-config.md`, `CHANGELOG.md`.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`. `.pharn/` (hook scratch) and
  stage artifacts are not build output — this feature's own `PLAN.md` / `GRILL.md`, and the untracked
  `PLAN.md` files of the two increments still queued (`update-frozen-recheck`, `tar-entry-names`).
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned (754 tests) +
  whole-repo `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config, so `lint` / `format:check` / `lint:md` are
  absent from both maps.
- **environment:** both sides ran with no proxy variables and as root **without** `CAP_DAC_OVERRIDE` /
  `CAP_DAC_READ_SEARCH` / `CAP_FOWNER` (`setpriv`), the CI-equivalent of this root sandbox.

## Per-gate exit codes

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`regression-report.json` `.verdict` = `no-regressions`.)

Residual (P0/P7): this catches exactly what its suite catches. The vitest suite exercising `src/**` is
owned by `/pharn-dev-build`'s floor and `/pharn-dev-verify`. This certifies the comparison, never the increment.
