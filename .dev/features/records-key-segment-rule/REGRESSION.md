# REGRESSION — records-key-segment-rule

- base: `b12e6ac164eac942d8492a3bfbb41c927b071583` (working tree dirty → `base = HEAD`, per the
  deterministic base rule; `git status --porcelain` was non-empty)
- machine report: `.dev/features/records-key-segment-rule/regression-report.json`

## Inside (the changed scope)

| file                             | declared in `## Files` |
| -------------------------------- | ---------------------- |
| `src/lib/install-records.ts`     | yes                    |
| `tests/install-records.test.ts`  | yes                    |
| `tests/update.test.ts`           | yes                    |
| `docs/reference/pharn-records.md` | yes                    |

**The exact partition, stated without ambiguity.** The full change set the scope helper was given is
`git diff --name-only HEAD` (tracked modifications) **plus** `git ls-files --others
--exclude-standard` (untracked-new) — seven paths in total:

| path                                              | changed by                |
| ------------------------------------------------- | ------------------------- |
| `src/lib/install-records.ts`                       | `/pharn-dev-build`        |
| `tests/install-records.test.ts`                    | `/pharn-dev-build`        |
| `tests/update.test.ts`                             | `/pharn-dev-build`        |
| `docs/reference/pharn-records.md`                  | `/pharn-dev-build`        |
| `.pharn/writes-scope.json`                         | every stage's Step 0 setter |
| `.dev/features/records-key-segment-rule/PLAN.md`   | `/pharn-dev-plan`         |
| `.dev/features/records-key-segment-rule/GRILL.md`  | `/pharn-dev-grill`        |

The **build-only** subset — the first four rows — is byte-identical to the plan's `## Files`: the
build wrote exactly what it declared, and nothing else. The remaining three are the other stages'
own artifacts, itemized in the next section. The **verdict** below was computed over the build-only
subset as `--inside`; that choice is the advisory orchestration this stage owns, and both partitions
are recorded here.

## The fix #7 scope check — raw result, and why it is not a build escape

The first `check-regress.mjs scope` run, given the FULL working-tree diff, exited **1** with three
blocking P0 findings:

| flagged path | actually owned by |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `.pharn/writes-scope.json` | the hook's own scope state — `.pharn/**` is the ALWAYS-writable scratch zone (`enforce-writes-scope.cjs:61`) |
| `.dev/features/records-key-segment-rule/PLAN.md` | `/pharn-dev-plan`'s declared `writes:` (`pharn-dev-plan.md:8`) |
| `.dev/features/records-key-segment-rule/GRILL.md` | `/pharn-dev-grill`'s declared `writes:` (`pharn-dev-grill.md:15`) |

None is a write `/pharn-dev-build` made. The helper compares the whole diff against **one** stage's
`## Files`, and with `base = HEAD` in a working-tree dogfood run the sibling stages' own artifacts
necessarily fall inside that diff. This is a **structural interaction between `base = HEAD` and the
loop writing its artifacts into the tree**, not evidence about the increment — and it will fire on
every dogfood `/pharn-dev-ship` run, so it is worth a human decision (see the note below).

The partition was therefore re-run over the four PRODUCT files only, which is the **advisory
orchestration choice** this stage explicitly owns (choosing the scope is orchestration; only the
comparison is floor). That run exited **0**, `escaped: []`. **Both runs are recorded here; the first
is not hidden.**

## Gate set and results

Style gates (`lint` / `format:check` / `lint:md`) were **skipped by the deterministic config-touch
rule**: `inside` touches no shared style config, so a style flip over the byte-identical outside files
is provably impossible. Skipped on **both** sides, so the gate sets match.

| gate       | base | head | flip |
| ---------- | ---- | ---- | ---- |
| `tests`    | 0    | 0    | none |
| `validate` | 0    | 0    | none |

`tests` = 46 outside test files (`.dev/floor/*.test.mjs` + `.claude/hooks/*.test.cjs`), 748 assertions,
0 failing at both base and head. `outside_eval_pairs` was empty (the one `evals/expected` path in the
repo is a `check-structural` fixture, not a committed pair).

> **An orchestration error worth recording:** the first two capture attempts produced
> `{"tests":1}` on **both** sides — which would have compared equal and read as "no regressions"
> while the gate had never run (zsh does not word-split unquoted `$TESTS`; then BSD `xargs` rejected
> `-a`). It was caught by checking the log for TAP output rather than trusting the exit code. The
> numbers above are from a run verified to have executed 748 assertions on both sides.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` exit **0**, `"verdict": "no-regressions"`.)

The verdict is floor-grade: it rests entirely on the helper comparing two exit-code maps. Everything
else in this document — the base choice, the inside/outside partition, running the suite — is
advisory orchestration.

**Honest residual (P7):** this catches **exactly what its suite catches, nothing more.** Breakage
outside the feature that no deterministic check covers is invisible to it. The claim is
"deterministically-detectable breakage outside the feature is caught," **not** "nothing broke."

## For the human (reported, never agent-fixed)

`.pharn/writes-scope.json` is **tracked in git** while also being the loop's per-stage mutable state,
so every `/pharn-dev-ship` run dirties it and every `scope` check over a full diff flags it. Whether
it should be gitignored is a repo-policy call, not this increment's.
