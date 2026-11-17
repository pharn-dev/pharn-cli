# REGRESSION — core-179-trim-docs

- Base: `a844f7a7c8fbbd4dd3eec339c24484bbcbfb38f0` (working-tree build, so base = HEAD).
- Inside (19 paths): the docs this increment changed, plus its PLAN/GRILL. None of them escapes the plan's declared files (`check-regress.mjs scope`: `escaped` 0).
- Outside gates: 47 stdlib `*.test.mjs`/`*.test.cjs` files (`node --test`), `node .dev/floor/validate.mjs .`, and the full vitest suite (`--maxWorkers=2`, through heavy.sh). Style gates were skipped, because no shared style config is inside.

| Gate     | base | head |
| -------- | ---- | ---- |
| tests    | 0    | 0    |
| validate | 0    | 0    |
| vitest   | 0    | 0    |

`regressions[]`: none. `pre_existing[]`: none.

REGRESSIONS: none, meaning no breakage outside the feature that these gates can detect (verdict `no-regressions`, from `check-regress.mjs`).
This certifies only the base→head comparison of these gates. It catches what the suite catches, and nothing more.
