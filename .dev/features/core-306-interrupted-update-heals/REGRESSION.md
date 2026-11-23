# REGRESSION — core-306-interrupted-update-heals

- Base: `11925f085980e6a7dfce3b0cf735bbf621397bf3` (origin/main after #425 and #426; the branch's fork point after the rebase).
- Inside (12 paths): the three source files, the two test files, the two reference docs, CHANGELOG.md and this
  feature's dev artifacts. None escapes the plan's declared files (`check-regress.mjs scope`: `escaped` 0).
- Outside gates: 47 stdlib `*.test.mjs`/`*.test.cjs` files (`node --test`), `node .dev/floor/validate.mjs .`, and
  the full vitest suite (`--maxWorkers=1`, through heavy.sh; at HEAD with `--coverage`). Style gates skipped: no
  shared style config is inside.

| Gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |
| vitest   | 0    | 0    |

`regressions[]`: none. `pre_existing[]`: none.

REGRESSIONS: none, meaning no breakage outside the feature that these gates can detect (verdict `no-regressions`, from `check-regress.mjs`).
This certifies only the base→head comparison of these gates. It catches what the suite catches, and nothing more.
