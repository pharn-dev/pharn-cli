# REGRESSION — hallucinated-api lens

- **base:** `2698dd9` (working-tree dogfood build; `git status --porcelain` non-empty — two untracked dirs — → base = HEAD)
- **verdict:** **`no-regressions`** (`.dev/floor/check-regress.mjs verdict` exit 0 — deterministic, no LLM)

## Inside / outside partition (deterministic, `check-regress.mjs scope` — `escaped: []`, no build-scope breach)

**Inside (the feature's declared `## Files`, 10 product files):** `pharn-review/hallucinated-api/**` — the lens +
its 3 eval cases + 6 expected files. All changed paths ⊆ declared writes (fix #7; `--declared` was extracted
independently from the plan's `## Files`, so the ⊆ check is real). The `.dev/features/hallucinated-api-lens/`
trace dir (PLAN/GRILL/this report) is pipeline bookkeeping, not build output, and is correctly excluded from the
build-scope check.

**Outside gates run (identical set at base and head):**

| gate                                                                                 | base | head | result |
| ------------------------------------------------------------------------------------ | ---- | ---- | ------ |
| `tests` (the project's `npm test` gate, full suite — feature ships no test files)    | 0    | 0    | OK     |
| `validate` (`.dev/floor/validate.mjs .`, whole-repo — 21 caps at base, 22 at head)   | 0    | 0    | OK     |
| `structural:trust-fence` (`check-structural` over trust-fence's committed eval pair) | 0    | 0    | OK     |

Style gates (`lint` / `format:check` / `lint:md`) were **deterministically skipped**: `inside` touches no shared
style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a style
flip over the byte-identical outside files is provably impossible (absent from both maps).

> **Method note (honest, P6).** A first capture used a broken `tests` invocation (`node --test` fed a
> newline-joined file list as one malformed argument → "Could not find …", exit 1 at **both** base and head).
> Because the flaw was identical on both sides it was correctly classed **pre-existing** (never a regression), but
> it did not reflect the project's real test gate. Re-run with the project's actual `npm test` command (node's own
> quoted-glob expansion, 348 pass) → `tests` is a clean **0/0**. The verdict was `no-regressions` under both
> invocations; the corrected one is the honest, project-faithful measurement.

- **regressions[]:** none.
- **pre_existing[]:** none.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The stage passes (exit 0).

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This
certifies the **comparison** (base vs head exit codes), **not** that the feature is correct — that is
`/pharn-dev-verify` (floor gates) + human review.
