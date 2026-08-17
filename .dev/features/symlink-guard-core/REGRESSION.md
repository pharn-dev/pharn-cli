# REGRESSION — symlink-guard-core

Base: **`2cd061d`** (`chore: remove dead legacy symbols`, #95). Resolved by the deterministic state
test (P5): `git status --porcelain` is non-empty (10 lines — a working-tree dogfood build), so
`base = HEAD`. The baseline was captured in a detached `git worktree` at that immutable SHA, so it
holds the committed bytes **without** this increment applied; the worktree was removed afterwards.

## Inside / outside partition (the floor helper computed it, not this stage)

`node .dev/floor/check-regress.mjs scope …` → exit **0**. `inside` (8) ≡ the plan's declared
`## Files` (8). **`escaped: []`** — no path was changed outside the declared writes, so no fix #7
breach.

| set                  | count | note                                                                    |
| -------------------- | ----- | ----------------------------------------------------------------------- |
| `inside`             | 8     | exactly the plan's `## Files` (the amended 7 product files + `CLAUDE.md`) |
| `outside_tests`      | 46    | every `*.test.mjs` / `*.test.cjs` — the hooks + the whole `.dev/floor/` suite |
| `outside_eval_pairs` | 0     | no committed eval pair lies outside the feature                          |

**Declared orchestration exclusions (advisory, stated not hidden):** `.pharn/**` (always-writable
scratch, named as such by the stage) and `.dev/features/symlink-guard-core/**` (this run's own
loop-owned artifacts) were excluded from `--changed`. Both are non-product; including them would have
manufactured a false fix #7 breach. This is the orchestration half of the two clocks — the verdict
below rests on exit codes, not on this choice. `CHANGELOG.md` appears in the plan's `## Files` only as
a struck-through exclusion (OQ5 → skip) and was not written; `declared` being a superset is harmless.

**Style gates skipped, deterministically (P5/P7):** `inside` touches no shared style config
(`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so over the
byte-identical outside files a style flip is provably impossible. Skipped on **both** sides, absent
from **both** maps — and the baseline `npm ci` cost is avoided with it. (Note: `format:check`, `lint`,
and `lint:md` were all run GREEN over the *inside* files at build time; that is a build-stage fact,
not part of this comparison.)

## Per-gate comparison (`base → head`, exit codes)

| gate       | base | head | flip?              |
| ---------- | ---- | ---- | ------------------ |
| `tests`    | 1    | 1    | no — pre-existing  |
| `validate` | 0    | 0    | no                 |

Identical gate-ids on both sides, so the comparison is conclusive (a gate-set mismatch would have
returned `inconclusive`, fail-closed).

## The pre-existing `tests` RED (not this increment's)

The aggregate `node --test` over all 46 outside test files exits **1 at the baseline commit as well**
— with none of this increment's changes applied — so it is **definitionally not a regression**: the
comparison only asks whether a gate flipped pass→fail, and this one was already failing. The same
pre-existing RED is recorded in the previous increment's report
(`.dev/features/dead-legacy-symbols/regression-report.json`, base `e097adb`), where it was traced to
a runner-level artifact of running all 46 suites together under parallel load rather than to any
failing assertion.

It is **not** this stage's job to re-decide that, and this increment does not touch any of those 46
files (they are `.dev/floor/**` and `.claude/hooks/**`; `inside` is `src/lib/**`, `tests/**`, and
`CLAUDE.md`). Worth a human's eye as separate maintenance — it makes the `tests` gate permanently
uninformative in this repo, which is a real erosion of what this stage can detect — but it is outside
this increment's axis.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

`regressions: []`, `pre_existing: ["tests"]`, `verdict: "no-regressions"`.

**Honest residual (P0/P7):** this catches **exactly what its suite catches — nothing more.** The
claim is "deterministically-detectable breakage outside the feature is caught," **not** "nothing
broke." A regression no deterministic check covers is invisible here, and the pre-existing `tests`
RED narrows that further: an outside flip inside those 46 suites would be masked by an aggregate that
is already 1. This is a report on the comparison, never a certification that the increment is whole.
