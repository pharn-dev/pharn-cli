# REGRESSION — missing-await-lens

- **base:** `7cca07e` (working-tree build; `git status --porcelain` non-empty ⇒ `base = HEAD`, per the deterministic base rule)
- **verdict (floor, `.dev/floor/check-regress.mjs verdict`):** `no-regressions` — exit 0
- **scope check (fix #7, `check-regress.mjs scope`):** `escaped: []` — the build wrote **only** its plan's `## Files`; no path escaped the declared writes-scope

## Inside / outside partition (deterministic, path-membership — P5)

- **inside (12, the feature — changed = purely additive new files):** `pharn-review/missing-await/**` (lens + 3 cases + 6 expected) and `.dev/floor/scan-code-missing-await.{mjs,test.mjs}`. The `.dev/features/missing-await-lens/**` pipeline trace (PLAN/GRILL/this report) is stage-artifact scaffolding, not build output, and is excluded from the changed set.
- **outside gates run at base AND head (identical gate set both sides):** `tests` (34 committed `*.test.{mjs,cjs}` — none inside the feature; the new `scan-code-missing-await.test.mjs` is untracked and therefore correctly outside the tracked test universe), `validate` (whole-repo `.dev/floor/validate.mjs .`), `structural:trust-fence` (the one committed eval pair, `pharn-review/trust-fence/…/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json` — outside the feature).
- **style gates (`lint`/`format:check`/`lint:md`): SKIPPED** deterministically — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style result cannot flip (the config-touch skip rule, P5/P7).

## Per-gate exit codes: base → head

| gate                     | base (`7cca07e`) | head | classification |
| ------------------------ | ---------------- | ---- | -------------- |
| `tests`                  | 0                | 0    | OK             |
| `validate`               | 0                | 0    | OK             |
| `structural:trust-fence` | 0                | 0    | OK             |

- **regressions[] (base==0 && head!=0):** none
- **pre_existing[] (base!=0):** none

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The increment is
purely additive (new files only; no existing file modified), so every outside gate is byte-identical
across base and head, and all pass. (`validate` widens 29→30 capabilities but stays GREEN both sides.)

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.**
A regression that no deterministic check covers (a broken behavior with no test/rule/eval) is invisible
here. This report certifies the **comparison** (`no-regressions`), not that the feature is whole — that is
`/pharn-dev-verify` (floor gates) and the human's call.
