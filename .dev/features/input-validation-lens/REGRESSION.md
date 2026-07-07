# REGRESSION — input-validation lens

- **base:** `HEAD` (working-tree dogfood build; `git status --porcelain` non-empty → base = HEAD)
- **verdict:** **`no-regressions`** (`.dev/floor/check-regress.mjs verdict` exit 0 — deterministic, no LLM)

## Inside / outside partition (deterministic, `check-regress.mjs scope` — `escaped: []`, no build-scope breach)

**Inside (the feature's declared `## Files`, 10 product files):** `pharn-review/input-validation/**` — the
lens + its 3 eval cases + 6 expected files. All changed paths ⊆ declared writes (fix #7). The
`.dev/features/input-validation-lens/` trace dir (PLAN/GRILL/this report) is pipeline bookkeeping, not build
output, and is correctly excluded from the build-scope check.

**Outside gates run (identical set at base and head):**

| gate                                                                                 | base | head | result |
| ------------------------------------------------------------------------------------ | ---- | ---- | ------ |
| `tests` (`npm test`, full suite — feature ships no test files, so outside = all)     | 0    | 0    | OK     |
| `validate` (`.dev/floor/validate.mjs .`, whole-repo)                                 | 0    | 0    | OK     |
| `structural:trust-fence` (`check-structural` over trust-fence's committed eval pair) | 0    | 0    | OK     |

Style gates (`lint` / `format:check` / `lint:md`) were **deterministically skipped**: `inside` touches no
shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so
a style flip over the byte-identical outside files is provably impossible (absent from both maps).

- **regressions[]:** none.
- **pre_existing[]:** none.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The stage passes.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This
certifies the **comparison** (base vs head exit codes), **not** that the feature is correct — that is
`/pharn-dev-verify` (floor gates) + human review.
