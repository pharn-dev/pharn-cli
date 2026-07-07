# REGRESSION — n-plus-one-lens

- **Base (pre-build baseline):** `a1e2e85` (working tree dirty at run time → `base = HEAD`, per the deterministic rule).
- **Question answered:** did building the `n-plus-one` lens break anything **OUTSIDE** the feature?
- **Verdict (deterministic — `.dev/floor/check-regress.mjs`):** `no-regressions`. **Stage PASSES.**

## Inside / outside partition (deterministic; `scope` exit 0, escaped: [])

- **Inside (the changed scope, ⊆ the plan's `## Files` — no fix#7 escape):** the 15 declared build outputs — the lens (`pharn-review/n-plus-one/n-plus-one.md`), its 4 eval cases + 8 expected files, and the two `.dev/floor/scan-code-n-plus-one.{mjs,test.mjs}` scanner files.
- **Outside (must not regress):** the 37 existing tracked `*.test.*` suites (via the canonical `npm test`), the whole-repo `validate`, and the one committed eval pair `structural:trust-fence`.
- **Style gates (`lint` / `format:check` / `lint:md`):** **skipped** deterministically — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style flip is provably impossible (P5/P7). No `npm ci` incurred.

## Per-gate `base → head` exit codes

| gate                   | base | head | result |
| ---------------------- | ---- | ---- | ------ |
| tests (`npm test`)     | 0    | 0    | OK     |
| validate (whole-repo)  | 0    | 0    | OK     |
| structural:trust-fence | 0    | 0    | OK     |

- **regressions[]:** none.
- **pre_existing[]:** none.

> Capture note (honest): the first `tests` capture used an explicit `node --test <file-list>` whose argument list was corrupted by a stray shell quote, yielding a spurious exit 1 **identically at base and head** (so the verdict was already correct — a flip needs base 0 → head 1). It was re-captured with the repo's canonical `npm test` (the same suite `/pharn-dev-verify` runs), which is GREEN (562 pass, 0 fail) at both base and head. The table above is the re-capture.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature. Stage PASSES.**

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more**. A regression that no deterministic check covers (a broken behavior with no test / rule / eval) is invisible here. This verdict certifies only the exit-code comparison over the gates above — **not** that the feature is correct or complete (that is `/pharn-dev-verify` + the human's job).
