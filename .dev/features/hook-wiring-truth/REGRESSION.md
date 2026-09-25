# REGRESSION — hook-wiring-truth

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `36ecf7003aa4fa9d3d9d755c73e15f20a0715f90` (`HEAD` — `origin/main` after #221; the
  build is an uncommitted working tree on top of it).
- **inside** (each declared in `PLAN.md` `## Files`):
  - `src/lib/hook-wiring.ts`, `src/commands/status.ts`
  - `tests/hook-wiring.test.ts`, `tests/status.test.ts`, `tests/update.test.ts`
  - `docs/commands/status.md`, `docs/commands/update.md`
  - `CLAUDE.md`, `CHANGELOG.md`
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`. `.pharn/` (hook
  scratch) and this feature's own stage artifacts are not build output.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned (754 tests) +
  whole-repo `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config, so `lint` / `format:check` /
  `lint:md` are absent from both maps.
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
