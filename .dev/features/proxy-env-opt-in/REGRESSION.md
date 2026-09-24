# REGRESSION — proxy-env-opt-in

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `8d1190624dae01810592cc1fcb716984bbd429c8` (`origin/main` at build time; the build is an uncommitted working tree on top of it).
- **inside** (each declared in `PLAN.md` `## Files`): `docs/troubleshooting.md`, `src/lib/proxy-env-format.ts`, `src/lib/proxy-env.ts`, `tests/proxy-env-format.test.ts`, `tests/proxy-env.test.ts`.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`. `.pharn/` (hook scratch) and this
  feature's own stage artifacts are not build output.
- **outside gates:** the stdlib `*.test.mjs` / `*.test.cjs` files + whole-repo `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config, so `lint` / `format:check` / `lint:md` are absent from both maps.

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
