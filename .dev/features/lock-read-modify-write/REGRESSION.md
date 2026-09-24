# REGRESSION — lock-read-modify-write

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `31f15cedcad80465396e2532f617f8afb60b3012` (`origin/main` at build time; the build is an uncommitted working tree on top of it).
- **inside** (each declared in `PLAN.md` `## Files`): `CLAUDE.md`, `README.md`, `src/commands/add.ts`, `src/commands/remove.ts`, `src/commands/update.ts`, `src/lib/pharn-config.ts`, `src/lib/project-lock.ts`, `tests/add.test.ts`, `tests/pharn-config.test.ts`, `tests/project-lock-commands.test.ts`, `tests/project-lock.test.ts`, `tests/remove.test.ts`, `tests/update.test.ts`.
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
