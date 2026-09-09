# REGRESSION — ci-smoke-built-bundle

Base: **`377e1f5fe30b8d43903a9305272a929393ed9b8e`** (`main`). Resolved by the deterministic rule, not
a choice: `git status --porcelain` is non-empty (a working-tree dogfood build), so `base = HEAD`.

## Inside / outside partition

`inside` — the working-tree delta at that base — is six paths, and `check-regress.mjs scope` returned
`escaped: []` (exit 0), so nothing was written outside the declared scope (fix #7):

| path                                           | declared by                        |
| ---------------------------------------------- | ---------------------------------- |
| `.github/workflows/ci.yml`                     | `PLAN.md` `## Files`               |
| `tests/ci-workflow.test.ts`                    | `PLAN.md` `## Files`               |
| `CHANGELOG.md`                                 | `PLAN.md` `## Files`               |
| `.dev/features/ci-smoke-built-bundle/PLAN.md`  | `/pharn-dev-plan`'s own `writes:`  |
| `.dev/features/ci-smoke-built-bundle/GRILL.md` | `/pharn-dev-grill`'s own `writes:` |
| `.pharn/writes-scope.json`                     | always-writable scratch            |

The last three are **stated as an explicit widening of `--declared`, not trimmed out of `--changed`**:
the helper was shown the complete delta, and the two pipeline artifacts plus the scratch file were
declared because each was written by an EARLIER stage under that stage's own writes-scope — never by
`/pharn-dev-build`, whose scope was pinned to exactly the three `## Files` paths. Hiding them from the
input would have made the fix #7 cross-check answer a question nobody asked.

`outside_tests`: 46 stdlib test files. `outside_eval_pairs`: none (this repo has no committed eval
pairs). The gate set actually run is the broader one this repo's prior regress runs use — the six
npm/floor gates below, over the whole tree — which strictly contains the outside scope.

## Per-gate exit codes

| gate           | base | head | result |
| -------------- | ---- | ---- | ------ |
| `format:check` | 0    | 0    | OK     |
| `lint`         | 0    | 0    | OK     |
| `lint:md`      | 0    | 0    | OK     |
| `typecheck`    | 0    | 0    | OK     |
| `test`         | 0    | 0    | OK     |
| `validate`     | 0    | 0    | OK     |

`regressions[]`: **empty**. `pre_existing[]`: **empty** (every gate was already GREEN at the
baseline, so nothing is excluded from blame).

The baseline was materialized with `git archive 377e1f5 | tar -x` into a scratch directory rather
than `git worktree add` — an ordinary checkout of the same tree that registers no git state outside
this worktree. `node_modules` was APFS-cloned into it so the baseline ran the identical dependency
set; the gate set is byte-identical on both sides by construction (one shell function, two calls),
which is what keeps `check-regress.mjs` from failing `inconclusive` on a gate-set mismatch.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` → `"verdict": "no-regressions"`, exit **0**.)

Residual, stated rather than implied: `/pharn-dev-regress` catches **exactly what its suite catches —
nothing more.** These six gates are all deterministic and all repo-local; a regression that no test,
lint rule, or floor checker covers is invisible here. In particular, **nothing in this comparison
executes GitHub Actions**, so "the new `Smoke the built bundle` step passes on the runner" is NOT
something this stage measured — it was verified locally (`npm run build`, then the exact step command,
exit 0) and is pinned as a file by `tests/ci-workflow.test.ts`. The claim is
"deterministically-detectable breakage outside the feature is caught", not "nothing broke", and this
report certifies only the comparison — never the increment as a whole.
