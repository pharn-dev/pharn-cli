# REGRESSION — proxy-notice-truth

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `f1e8b92cfba1c59c19b1743cde23e77c54ac64bb` (`HEAD` — `origin/main` after #220; the
  build is an uncommitted working tree on top of it).
- **inside** (each declared in `PLAN.md` `## Files`):
  - `src/lib/proxy-env.ts`, `src/lib/proxy-env-format.ts`
  - `tests/proxy-env.test.ts`, `tests/proxy-env-format.test.ts`
  - `tests/setup/hermetic-env.ts` (new), `vitest.config.ts`
  - `docs/troubleshooting.md`, `CHANGELOG.md`

  The four command test files the plan also declared needed no change.

- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`. `.pharn/` (hook
  scratch) and this feature's own stage artifacts are not build output.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned (754 tests) +
  whole-repo `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config (`vitest.config.ts` is not one), so
  `lint` / `format:check` / `lint:md` are absent from both maps.
- **environment:** both sides ran with no proxy variables and as root **without**
  `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` / `CAP_FOWNER` (`setpriv`), the CI-equivalent of this
  root sandbox.

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

Residual (P0/P7): this catches exactly what its suite catches. The vitest suite exercising `src/**`
is owned by `/pharn-dev-build`'s floor and `/pharn-dev-verify`. This certifies the comparison, never
the increment.
