# REGRESSION — publish-npm-floor-assert

Base: **`e08eb18c16ce260bb5039d039dcb9c56397d1a9e`** (working tree was dirty → `base = HEAD`, the
deterministic rule, not a choice). Machine report: `regression-report.json` (the helper's verdict
JSON, verbatim).

## Inside / outside partition

`inside` (the feature's changed scope — 4 files, all declared in `PLAN.md` `## Files`):

- `.github/workflows/publish.yml`
- `docs/RELEASING.md`
- `.dev/floor/check-run-pins.mjs`
- `.dev/floor/check-run-pins.test.mjs`

The fix #7 cross-check ran with the loop-owned artifacts (`.dev/features/publish-npm-floor-assert/**`,
`.pharn/**`) included in `--changed` and covered by `--declared`, rather than omitted from the changed
set — a deliberately stricter partition than the convention, so that a stray write anywhere would have
surfaced. Result: **`escaped: []`** — nothing was written outside the declared writes-scope.

`outside`: **45 test files** (`outside_eval_pairs: 0` — this repo commits no eval pairs). The
increment's own `.dev/floor/check-run-pins.test.mjs` is correctly **inside**, so it is not an outside
gate.

## Gate table — identical gate set at base and head

| gate | base | head | flip |
| ---- | ---- | ---- | ---- |
| `tests` (45 outside files, 704 assertions) | 0 | 0 | none |
| `validate` (`node .dev/floor/validate.mjs .`, whole-repo) | 0 | 0 | none |

**Style gates deliberately absent from both maps.** The deterministic skip rule applies: `inside`
touches no shared style config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
`.markdownlint-cli2.jsonc` all unmodified), so a style result over the byte-identical outside files
cannot flip. Skipped on both sides, so the gate sets match and the comparison stays conclusive.

## Orchestration correction (worth recording)

The first baseline capture reported `tests: 1`. That was **not** a regression and not a pre-existing
failure — it was a defect in this stage's own orchestration: the shell here is **zsh**, which does not
word-split an unquoted parameter expansion, so all 45 paths reached `node --test` as a single
filename (`Could not find '<45 paths concatenated>'`). Re-run with `${=OUTSIDE}`, the baseline is
`tests: 0` over 704 passing assertions. Recorded because a silently-accepted `1` would have produced a
**false** `pre_existing` entry and made every future comparison against this baseline meaningless.

## Verdict

```text
REGRESSIONS: none — no deterministically-detectable breakage outside the feature
```

`node .dev/floor/check-regress.mjs verdict …` → `"verdict": "no-regressions"`, **exit 0**.
`regressions: []`, `pre_existing: []`.

**The residual, named not hidden (P0/P7):** this stage catches **exactly what its suite catches —
nothing more.** The claim is "deterministically-detectable breakage outside the feature is caught," not
"nothing broke." Specifically uncovered here: `publish.yml` cannot be executed by any gate in this repo
(it fires only on `release: published`), so no outside gate observes the release path — the assert's
execution proof of record is the next release, and `docs/RELEASING.md` prose is covered only by
`markdownlint`, which checks form, not truth.

This certifies **the comparison**, not the feature. Whether the increment is good is the human's call
at the post-review gate.
