# REGRESSION — parallel-lens-merge

- **Base:** `61fa920` (working-tree dogfood build → `base = HEAD`; the uncommitted increment measured vs the last commit).
- **Method:** the identical outside-scoped gate set was captured at the baseline worktree and at HEAD; the verdict is `.dev/floor/check-regress.mjs verdict` (deterministic exit-code comparison, ZERO LLM-judge).

## Inside / outside partition (deterministic — `check-regress.mjs scope`, exit 0, no escape)

- **Inside (⊆ the plan's `## Files`, no breach):** the 8 built files — `.dev/floor/{merge-findings,count-lenses,lens-scanner-map}{,.mjs,.test.mjs,.json}` + `.claude/commands/{pharn-review,pharn-dev-review}.md`. (Pipeline artifacts under `.dev/features/parallel-lens-merge/` are the audit trail, excluded from the changed-set — not build output.)
- **Outside:** 40 tracked test files + `validate` (whole-repo) + 1 committed eval pair (`structural:trust-fence`). Style gates (`lint`/`format:check`/`lint:md`) were **skipped** deterministically — `inside` touches no shared style config, so an outside style flip is provably impossible.

## Per-gate `base → head` (exit codes)

| gate                     | base | head | result |
| ------------------------ | ---- | ---- | ------ |
| `tests` (40 outside)     | 0    | 0    | OK     |
| `validate` (whole-repo)  | 0    | 0    | OK     |
| `structural:trust-fence` | 0    | 0    | OK     |

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** (`check-regress.mjs verdict` exit 0; `regression-report.json` `.verdict = "no-regressions"`.)

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A regression no deterministic check covers (a broken behavior with no test/rule/eval — e.g. the _advisory_ parallel-spawn orchestration in `/pharn-review`, which has no deterministic gate by nature) is invisible here. This certifies the **comparison**, never that the feature is whole.

_(A method note, for the record: the first capture attempt mis-passed the 40-file list to `node --test` as a single argument (a non-splitting whitespace separator), which spuriously produced `tests:1` on **both** sides — identical, so it would not have manufactured a false regression, but it was corrected to a real 40-file run before this verdict. Both sides now genuinely pass.)_
