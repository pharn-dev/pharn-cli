# REGRESSION — magic-values lens

- **Base:** `0082ad75694796ed29bd235ed7583ff8e5da13c5` (working-tree dogfood build → `base = HEAD`, per `git status --porcelain` non-empty).
- **Feature:** `magic-values-lens`.
- **Verdict (FLOOR, `.dev/floor/check-regress.mjs verdict`):** `no-regressions` — exit 0.

## Inside / outside partition (deterministic, `.dev/floor/check-regress.mjs scope` — exit 0, `escaped: []`)

- **Inside (the feature's allowed change-set, 17 paths):** the 15 planned `## Files` (the `magic-values`
  lens + its 4 eval cases × {case, expected.json, expected.md} + the `scan-code-magic-values.mjs`
  scanner + its test) plus the feature's own audit-trail artifacts (`PLAN.md`, `GRILL.md`).
- **fix #7 re-check (FLOOR):** every changed path is within the declared writes-scope (the 15 `## Files`
  - `.dev/features/magic-values-lens/**`). **`escaped: []`** — the build did not write outside its
    plan's `## Files`.
- **Outside gates run at base and HEAD (identical gate set both sides):** `tests` (the 35 committed
  `*.test.mjs`/`*.test.cjs` suites, the feature's own untracked test excluded), `validate` (whole-repo),
  `structural:trust-fence` (the one committed eval pair,
  `pharn-review/trust-fence/…/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
  Style gates (`lint`/`format:check`/`lint:md`) were **skipped** deterministically — the inside set
  touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
  `.markdownlint-cli2.jsonc`), so an outside style flip is provably impossible.

## Per-gate exit codes (base → head)

| gate                     | base | head | result |
| ------------------------ | ---- | ---- | ------ |
| `tests`                  | 0    | 0    | OK     |
| `validate`               | 0    | 0    | OK     |
| `structural:trust-fence` | 0    | 0    | OK     |

- **`regressions[]`:** none.
- **`pre_existing[]`:** none.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** Every outside gate
that was GREEN at the baseline is still GREEN at HEAD; the increment adds only new files and modifies no
existing tracked code, so nothing outside its scope flipped pass→fail.

> **Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing
> more.** A regression that no deterministic check covers (a broken behavior with no test/rule/eval) is
> invisible here. This verdict certifies the **comparison** (outside gates unchanged base→head), **not**
> that the feature is correct or that "nothing broke." Feature correctness is `/pharn-dev-verify`'s and the
> human's job.
