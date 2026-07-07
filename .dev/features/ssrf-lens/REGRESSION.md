# REGRESSION — ssrf lens

- **Base:** `056ac24` (working-tree dogfood build → `base = HEAD`; `git status --porcelain` non-empty, so the increment is the uncommitted working tree).
- **Verdict (FLOOR — `.dev/floor/check-regress.mjs verdict`):** **`no-regressions`** (exit 0). Zero deterministically-detectable pass→fail flips outside the feature.

## Inside / outside partition (deterministic, `check-regress.mjs scope` — exit 0, no escape)

- **Inside (the feature's declared `## Files`, 15 paths):** `pharn-review/ssrf/**` (lens + 4 case/expected eval pairs) and `.dev/floor/scan-code-ssrf.mjs` + `.dev/floor/scan-code-ssrf.test.mjs`. `inside ⊆ declared` held — **`escaped: []`** (no fix #7 writes-scope breach). The `.dev/features/ssrf-lens/` trace artifacts (PLAN/GRILL/this report) are pipeline meta-output, excluded from the partition (mirrors the crypto increment's convention).
- **Outside (must not regress):** the 26 tracked test files, whole-repo `validate`, and the committed `structural:trust-fence` eval pair.

## Per-gate exit codes (base → head)

| gate                           | base | head | result |
| ------------------------------ | ---- | ---- | ------ |
| `tests` (26 tracked, 325 pass) | 0    | 0    | clean  |
| `validate` (whole-repo)        | 0    | 0    | clean  |
| `structural:trust-fence`       | 0    | 0    | clean  |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

**Style gates (`lint` / `format:check` / `lint:md`) deterministically skipped (P5/P7):** no `inside` file touches a shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a style-result flip over the byte-identical outside files is provably impossible.

> **Capture note (transparency):** the first `tests`-gate capture erroneously recorded exit 1 at both base and head — an artifact of zsh not word-splitting an unquoted file-list variable (`node --test` received the whole list as one filename). Re-captured with explicit field-splitting: the tracked suite is **325 pass / 0 fail (exit 0)** at both base and head. The corrected maps drive the verdict above; no real test ever failed.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (exit 0)

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its deterministic suite catches — nothing more.** A regression no test / rule / eval covers is invisible to it. This report certifies the **exit-code comparison** (was-GREEN-still-GREEN outside the feature), **not** that the increment is whole or correct — that is `/pharn-dev-verify`'s floor gates and the human's call.
