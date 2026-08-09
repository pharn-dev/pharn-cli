# REGRESSION — nontty-gate

- **base:** `74a6b40` (working-tree dogfood build → `git status --porcelain` non-empty ⇒ `base = HEAD`,
  so the baseline is the committed pre-build state and HEAD is the working tree)
- **verdict source:** `.dev/floor/check-regress.mjs verdict` → `.dev/features/nontty-gate/regression-report.json`

## Scope partition (computed by `check-regress.mjs scope`, exit 0)

**`escaped: []`** — every changed file is inside the plan's declared `## Files`. No fix #7 breach.

| | count | |
| --- | --- | --- |
| inside (the feature) | 13 | the plan's `## Files`, exactly |
| outside_tests | 43 | floor + hook test files |
| outside_eval_pairs | 0 | no committed eval pairs in this repo |

**Named exclusions from `changed`** (deliberate, not silent): `.pharn/**` (always-writable stage
scratch, rewritten by every stage's own Step 0 setter) and `.dev/features/nontty-gate/**` (this
increment's own stage artifacts — `PLAN.md`, `GRILL.md`, and the two reports). Neither is a build
output, and counting them would have produced a false fix #7 breach.

## Gate results

| gate | base (`74a6b40`) | head | flipped? |
| --- | --- | --- | --- |
| `tests` (43 files, 666 assertions) | 0 | 0 | no |
| `validate` (`.dev/floor/validate.mjs .`) | 0 | 0 | no |

**Style gates deliberately skipped on BOTH sides.** `inside` touches no shared style config
(`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so over the
outside files — byte-identical at base and head — a style result flip is provably impossible. Absent
from both maps, so no gate-set mismatch. (`npm run format:check` / `lint` / `lint:md` were nonetheless
run GREEN at head during `/pharn-dev-build` Step 3.)

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Measurement correction (recorded, not hidden)

The first capture recorded `tests: 1` at **both** base and head, which `check-regress.mjs` correctly
classified as `pre_existing` rather than a regression. That reading was a **measurement artifact of the
orchestration, not a real failure**: the 43 paths were passed to `node --test` through an unquoted zsh
parameter expansion, and zsh — unlike bash — does not word-split those, so node received one 3 KB
"filename", failed to find it, and exited 1 on both sides. Re-run with the list piped through `xargs`
under `bash`, both sides execute for real: **666 tests, 0 fail, exit 0**. The report above is the
corrected run; `pre_existing` is now empty. A gate that fails identically on both sides for a spurious
reason is precisely the "green for the wrong reason" shape this stage exists to expose, so it is named
here rather than quietly overwritten.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` exit **0**, `"verdict": "no-regressions"`.)

The comparison is the guarantee; the orchestration around it (choosing the base, scoping, running the
suite) is advisory. And the honest residual: this stage catches **exactly what its suite catches —
nothing more**. A behavior broken outside the feature with no deterministic check covering it is
invisible here. This is not a claim that nothing broke.
