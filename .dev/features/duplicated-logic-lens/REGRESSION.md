# REGRESSION — duplicated-logic lens

- **Base:** `540fe9d` (working tree dirty → `base = HEAD`, a dogfood build). Baseline captured in a
  detached `git worktree` at that SHA; HEAD captured in the working tree.
- **Verdict (FLOOR — `.dev/floor/check-regress.mjs verdict`): `no-regressions` (exit 0).** No
  deterministically-detectable breakage outside the feature.

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no fix#7 breach)

- **Inside (15 files):** the plan's `## Files` — `pharn-review/duplicated-logic/**` (lens + 4 eval cases + 8
  expected) and `.dev/floor/scan-code-duplicated-logic.{mjs,test.mjs}`. `inside ⊆ declared` → **no scope
  breach** (fix #7 re-confirmed; `escaped: []`).
- **Pipeline trace dir** `.dev/features/duplicated-logic-lens/**` (PLAN/GRILL/REGRESSION/… written by other
  self-scoped stages) is **excluded** from `inside` — it is not the feature's build footprint.
- **Outside gates run:** `tests` (the committed `*.test.{mjs,cjs}` universe — the untracked new
  `scan-code-duplicated-logic.test.mjs` is **inside**, excluded), `validate` (whole-repo floor),
  `structural:trust-fence` (the one committed outside eval pair:
  `…/expected-injection-comment.json` ↔ `.dev/features/trust-fence/findings.json`).
- **Style gates (`lint` / `format:check` / `lint:md`) skipped** deterministically: `inside` touches no
  shared style config (`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` /
  `.markdownlint-cli2.jsonc`), so a style flip over the byte-identical outside files is provably
  impossible (P5/P7).

## Per-gate exit codes (base → head)

| gate                   | base | head | result |
| ---------------------- | ---- | ---- | ------ |
| tests                  | 0    | 0    | OK     |
| validate               | 0    | 0    | OK     |
| structural:trust-fence | 0    | 0    | OK     |

- **regressions[]:** none.
- **pre_existing[]:** none — the committed suite is GREEN at baseline (409 tests pass) and at HEAD.

> **Measurement note (honesty, P6).** The `tests` gate was run via `git ls-files '*.test.mjs'
'*.test.cjs' | xargs node --test` — a shell-agnostic invocation. An earlier attempt that relied on
> unquoted word-splitting misfired under **zsh** (the whole path list was passed as one argument →
> "Could not find" → a spurious exit 1 at BOTH base and head); it was caught and re-measured. The
> corrected, identical-both-sides result is `tests: 0 → 0` (confirmed: 409 committed tests pass).

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`no-regressions`,
exit 0.)

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its deterministic suite catches — nothing
more.** A regression no test / rule / eval covers is invisible to it. This certifies the **comparison**
(green→green outside the feature), **not** that the feature is correct or that "nothing broke" in an
absolute sense — that is `/pharn-dev-verify`'s and the human's job.
