# REGRESSION — resource-leak-lens

Did building the resource-leak lens break anything **outside** the feature? The verdict is a
deterministic exit-code comparison (`.dev/floor/check-regress.mjs verdict`) — **zero LLM-judge**.

- **Base:** `9fc95c903e7a55d4cccf25ba0be6e000af740735` (dirty working tree → `base = HEAD`; the built increment is uncommitted).
- **Inside (the feature's changed footprint, 17 files):** `pharn-review/resource-leak/**` (lens + 4 cases + 8 expected), `.dev/floor/scan-code-resource-leak.{mjs,test.mjs}`, and the feature trace `.dev/features/resource-leak-lens/{PLAN,GRILL}.md`. **No changed file escaped the declared writes** (`scope` → `escaped: []`, fix #7 clean).
- **Outside gate set (identical at base and head):** `tests` (`node --test` over the 32 tracked test files — my new `scan-code-resource-leak.test.mjs` is inside, correctly excluded), `validate` (whole-repo `validate.mjs`), and `structural:trust-fence` (`check-structural` over the one committed eval pair `pharn-review/trust-fence/…/expected-injection-comment.json ↔ .dev/features/trust-fence/findings.json`).
- **Style gates skipped (deterministic, P5/P7):** `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a style flip over the byte-identical outside files is provably impossible; skipped on both sides (no `npm ci`).

## Per-gate exit codes (base → head)

| gate                     | base | head | result |
| ------------------------ | ---- | ---- | ------ |
| `tests`                  | 0    | 0    | OK     |
| `validate`               | 0    | 0    | OK     |
| `structural:trust-fence` | 0    | 0    | OK     |

- **regressions[]:** none
- **pre_existing[]:** none

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`check-regress.mjs verdict` → `"no-regressions"`, exit 0.)

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A regression that no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This verdict certifies **the comparison** (was-GREEN-still-GREEN outside the feature), **never** "nothing broke" and never that the feature itself is correct — that is `/pharn-dev-verify` (floor gates) and the human's job.
