# REGRESSION — overwrite-prompt-rows

Base: **`977aa38`** (`build: add the npm run dev script both contributor docs already document (#143)`),
which is both `HEAD` at the start of this run and the merge-base with `origin/main`. The base gates
were measured in a **separate detached checkout** of that commit, not by stashing — so the baseline
run saw the pre-build tree with no chance of a working-tree artifact leaking into it.

## Partition

`inside` — the build-attributable changed set, all five declared in the plan's `## Files`:

```text
CHANGELOG.md
docs/commands/init.md
docs/reference/pharn-config.md
src/steps/overwrite-check.ts
tests/overwrite-check.test.ts
```

`node .dev/floor/check-regress.mjs scope` over that set returned **`escaped: []`** and **exit 0** —
the build did not escape the plan's declared files (fix #7).

**Scoping note, recorded rather than silently applied.** The raw changed set also contains
`.dev/features/overwrite-prompt-rows/**` — this feature's own stage artifacts (PLAN, GRILL, this
file, the two reports, REVIEW, SHIP). Those are not build outputs: each is written by the stage that
owns it, under that stage's own writes-scope. Attributing them to the build would be a false breach,
so `--changed` names the five files above. Nothing else was dropped.

`outside_tests` and `outside_eval_pairs` are both **empty**: this repo ships no committed eval pair,
so no `structural:*` gate exists to run. Absent by convention, not skipped.

## Gate results

Six gates, each run twice — once in the detached base checkout, once on this head — and compared by
`node .dev/floor/check-regress.mjs verdict`. Exit codes only; no model judgment in the comparison.

| Gate           | Command                                | Base | Head |
| -------------- | -------------------------------------- | ---- | ---- |
| `test`         | `npm test`                             | 0    | 0    |
| `lint`         | `npm run lint`                         | 0    | 0    |
| `typecheck`    | `npm run typecheck`                    | 0    | 0    |
| `format:check` | `npm run format:check`                 | 0    | 0    |
| `lint:md`      | `npm run lint:md`                      | 0    | 0    |
| `floor`        | `node .dev/floor/validate.mjs .`       | 0    | 0    |

Suite size moved **1056 → 1061** (51 files both times); the five new tests all live in
`tests/overwrite-check.test.ts`, which goes 7 → 12. No existing test was edited or deleted — the
diff on that file is purely additive (94 insertions, 0 deletions), which is what keeps the seven
pre-existing assertions usable as the "nothing changed for a conflict-free project" evidence.

## Verdict

```json
{ "verdict": "no-regressions", "regressions": [], "pre_existing": [] }
```

`regression-report.json`, exit **0**.

## Honest scope

This says exactly one thing: **no gate that passed at `977aa38` fails at this head.** It does not say
nothing broke. A regression that no test, lint rule, or type covers is invisible to an exit-code
comparison, and the two behaviors most exposed here — whether the prose in two docs actually matches
the code, and whether `pharn init` end to end survives a corrupt config — are precisely the kind
nothing in this suite measures. Both are named as advisory in `PLAN.md`'s guarantee audit and in
`GRILL.md` F1/F5, not smuggled in under this green.

One measurement worth recording, because it is the reason the base numbers are trustworthy: an
earlier results-file pair in the shared scratch directory came back with a **gate-set mismatch**
(`only in base: [validate], only in head: [floor]`) and `check-regress` fail-closed to
`inconclusive`, exit 2 — the file had been written by something other than this run. Rather than
hand-patching the key, both sides were **re-measured from scratch** under names unique to this
feature. The green above is from that second pair, not from a repaired first one.
