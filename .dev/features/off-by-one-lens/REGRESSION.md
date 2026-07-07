# REGRESSION — off-by-one-lens

- **base:** `e1d9e32` (working-tree build; `git status --porcelain` non-empty ⇒ `base = HEAD`, per the deterministic base rule)
- **verdict (floor, `.dev/floor/check-regress.mjs verdict`):** `no-regressions` — exit 0
- **scope check (fix #7, `check-regress.mjs scope`):** `escaped: []` — the build wrote **only** its plan's `## Files`; no path escaped the declared writes-scope

## Inside / outside partition (deterministic, path-membership — P5)

- **inside (12, the feature — changed = purely additive new files):** `pharn-review/off-by-one/**` (lens + 3 cases + 6 expected) and `.dev/floor/scan-code-off-by-one.{mjs,test.mjs}`. The `.dev/features/off-by-one-lens/**` pipeline trace (PLAN/GRILL/this report) is stage-artifact scaffolding, not build output, and is excluded from the changed set.
- **outside gates run at base AND head (identical gate set both sides):** `tests` (33 committed `*.test.{mjs,cjs}` — none inside the feature), `validate` (whole-repo `.dev/floor/validate.mjs .`), `structural:trust-fence` (the one committed eval pair, `pharn-review/trust-fence/…/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json` — outside the feature).
- **style gates (`lint`/`format:check`/`lint:md`): SKIPPED** deterministically — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so an outside style result cannot flip (the config-touch skip rule, P5/P7).

## Per-gate exit codes: base → head

| gate                     | base (`e1d9e32`) | head | classification |
| ------------------------ | ---------------- | ---- | -------------- |
| `tests`                  | 0                | 0    | OK             |
| `validate`               | 0                | 0    | OK             |
| `structural:trust-fence` | 0                | 0    | OK             |

- **regressions[] (base==0 && head!=0):** none
- **pre_existing[] (base!=0):** none

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The increment is
purely additive (new files only; no existing file modified), so every outside gate is byte-identical
across base and head, and all pass.

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.**
A regression that no deterministic check covers (a broken behavior with no test/rule/eval) is invisible
here. This report certifies the **comparison** (`no-regressions`), not that the feature is whole — that is
`/pharn-dev-verify` (floor gates) and the human's call.

> Process note (not a code finding): the `tests` gate initially mis-read as red because the capture command relied on POSIX word-splitting of an unquoted file list, which this **zsh** environment does not perform (the whole list became one bad path). Re-captured with correct array splitting → stable `0/0`. The underlying committed suite was green throughout (`npm run check` GREEN; each file passes). No code was involved.
