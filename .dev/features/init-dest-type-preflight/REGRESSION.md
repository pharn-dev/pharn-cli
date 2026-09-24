# REGRESSION — init-dest-type-preflight

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `6920b79be17ff0f6e65bcbce9a7ab48d68550400` (`origin/main` at build time; the build is an uncommitted working tree on top of it).
- **inside** (each declared in `PLAN.md` `## Files`): `docs/troubleshooting.md`, `src/lib/install-capabilities.ts`, `src/lib/symlink-guard.ts`, `tests/install-capabilities.test.ts`.
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
