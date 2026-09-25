# REGRESSION — models-pharn-oss-owned

**Iteration 2** (after the GATE 2 "fix" decision — see `SHIP.md`). Re-run over the fixed tree with the
same base and gate set; the numbers below are this run's, and they match iteration 1 exactly.

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `c40a40c48555d6bce378e42567551f5b3ae26525` (`HEAD` = `origin/main` after #230; the build is
  an uncommitted working tree on top of it, so `git status --porcelain` is non-empty → `base = HEAD`).
- **inside:** the 42 paths `git diff --name-only HEAD` + untracked-new files report, each declared in
  `PLAN.md` `## Files` — 4 new `src/lib` modules, 2 deleted ones, 9 changed `src` files, the vendored
  pharn-oss checker, 5 new test files, 2 deleted test files, 8 changed test files, 10 docs, `CLAUDE.md`
  and `CHANGELOG.md` (full list in `regression-report.json` `.inside`).
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`. `.pharn/` (hook scratch)
  and this feature's own stage artifacts are not build output.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned (754 tests) +
  whole-repo `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config (`eslint.config.mjs`,
  `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so `lint` / `format:check` /
  `lint:md` are absent from both maps.
- **environment:** the base ran in a fresh `git worktree add --detach` of the base SHA (no gitignored
  `test-*/` trees on either side); both sides ran with the proxy variables unset.

## Per-gate exit codes

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

`node --test`: 754 tests, 754 pass, 0 fail on both sides. `validate`: `FLOOR: GREEN` on both sides.

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`regression-report.json` `.verdict` = `no-regressions`.)

Residual (P0/P7): this catches exactly what its suite catches. The vitest suite exercising `src/**`
is owned by `/pharn-dev-build`'s floor and `/pharn-dev-verify`. This certifies the comparison, never
the increment.
