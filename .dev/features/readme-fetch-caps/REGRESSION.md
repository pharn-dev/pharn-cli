# REGRESSION — readme-fetch-caps

Base = `377e1f5` (`git status --porcelain` non-empty → working-tree build → `base = HEAD`, the
deterministic state test in Step 1, not a choice). Measured in a detached worktree at that SHA; head is
this working tree.

## Partition

`check-regress.mjs scope` → **exit 0, `escaped: []`.** The changed set equals the plan's declared
`## Files` exactly, so the build did not escape its writes-scope.

| | paths |
| --- | --- |
| `inside` (changed) | `README.md`, `CHANGELOG.md` |
| `declared` (PLAN `## Files`) | `README.md`, `CHANGELOG.md` |
| `escaped` | — none — |
| `outside_tests` | 46 floor/hook `*.test.mjs` / `*.test.cjs` |
| `outside_eval_pairs` | none (no committed eval pair in this repo) |

## Gates — `base → head`

The **full** repo gate set was run at both ends, not the reduced set the style-skip rule permits. The
skip rule would have allowed dropping `lint` / `format:check` / `lint:md` (this feature touches no
shared style config, so a style flip over unchanged outside files is provably impossible) — but the
feature edits markdown, `lint:md` is precisely the gate that governs markdown, and the doc is explicit
that widening the suite never weakens the comparison. Running them is the cheaper mistake.

| gate | base | head |
| --- | --- | --- |
| `tests` (`node --test`, 46 outside files) | 0 | 0 |
| `test` (vitest, 1122 tests) | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate` (`.dev/floor/validate.mjs .`) | 0 | 0 |

Identical gate-ids on both sides, so the comparison is well-formed rather than `inconclusive`.

## Verdict

```text
check-regress.mjs verdict → exit 0
"verdict": "no-regressions"
"regressions": []
"pre_existing": []
```

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

## One measurement note, recorded rather than quietly re-run

The **first** baseline capture returned `format:check: 2`, `lint:md: 254`, `validate: 1` — the last
three gates in script order. Each was then run **interactively in the same baseline worktree and passed**
(`All matched files use Prettier code style!`, `0 issues in 0 files`, `FLOOR: GREEN`), and two further
full script runs returned all-zero. The reds were environmental — `node --test` across 46 files
immediately followed by a full vitest run, back-to-back in one shell — not a property of the baseline
tree. The recorded `base-results.json` is a reproduced run, not the outlier.

This is written down because silently re-running until the numbers look right is how a baseline stops
meaning anything. The honest reading: **this suite is not perfectly reproducible under load**, and a
future single-shot capture could record a false RED (which `check-regress` would then report as
`pre_existing` and exclude) or, more dangerously, a false GREEN at base that manufactures a phantom
regression at head. Neither happened here — both ends were confirmed twice — but the flakiness is a
property of the harness worth knowing.

## Residual (P0/P7 — the honest scope)

`/pharn-dev-regress` catches **exactly what its suite catches, nothing more.** Every gate above is a check
that already existed; a regression no deterministic check covers is invisible to this stage. For this
increment that residual is unusually wide and unusually harmless at once: the change is **prose only**,
`git diff src/` is empty, and **no gate in this repo compares README text to the constants in
`src/lib/`** — so the correctness of the numbers this PR writes is verified by the reading recorded in
`PLAN.md`'s discovery table and by human review, **not** by anything above. "No regressions" here means
the comparison found none; it is not a statement that the new sentences are true.
