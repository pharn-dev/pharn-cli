# REGRESSION — config-capability-name-validation

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `2fffcb3d5039b570ac8cdf0ac38d46336633fc3b` — passed explicitly (`--base 2fffcb3`, the
  reviewed baseline; the build is an uncommitted working tree on top of it).
- **inside** (all declared in `PLAN.md` `## Files`): `CLAUDE.md`, `SECURITY.md`,
  `src/commands/remove.ts`, `src/lib/pharn-config.ts`, `src/lib/validate.ts`,
  `tests/pharn-config.test.ts`, `tests/remove.test.ts`, `tests/validate.test.ts`.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []` — no fix #7 finding.
  `.pharn/writes-scope.json` (hook scratch) and this feature's own `.dev/features/…` stage artifacts are
  not build output.
- **outside gates:** 46 stdlib test files (`*.test.mjs` / `*.test.cjs`) + whole-repo `validate`;
  0 committed eval pairs.

## Style-gate skip (P5/P7)

`lint` / `format:check` / `lint:md` skipped at both sides: `inside` touches no shared style config.

## Per-gate exit codes

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`regression-report.json` `.verdict` = `no-regressions`; helper exit **0**.)

Residual (P0/P7): this catches exactly what its suite catches. The vitest suite exercising
`src/**` is inside scope here and is owned by `/pharn-dev-build`'s floor (`npm run check` GREEN, 1277/1277
as a non-root user on node 22) and `/pharn-dev-verify`. This certifies the comparison, never the increment.
