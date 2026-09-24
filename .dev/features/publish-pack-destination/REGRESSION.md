# REGRESSION — publish-pack-destination

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `0ca29b7ea8ce03d352bc6103fc35c42cf3149e47` (`HEAD` — the build is an uncommitted working tree on
  top of it, so `git status --porcelain` is non-empty).
- **inside** (each declared in `PLAN.md` `## Files`): `.github/workflows/publish.yml`,
  `.dev/floor/check-run-pins.test.mjs`, `CHANGELOG.md`.
- **scope partition:** `check-regress.mjs scope` exited **0**, `escaped: []`. `.pharn/` (hook scratch) and
  stage artifacts are not build output — this feature's own `PLAN.md` / `GRILL.md`, and the untracked
  `PLAN.md` files of the three other increments accepted at the same GATE 1
  (`init-manual-carry`, `update-frozen-recheck`, `tar-entry-names`), which this build did not touch.
- **outside gates:** the 45 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned (704 tests) + whole-repo
  `validate`; 0 committed eval pairs.
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
