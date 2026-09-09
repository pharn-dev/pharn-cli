# REGRESSION — retire-degit-present-tense

**Base:** `a382bc3447016af8a28abe16e5cf2e8d35b74c78`
(`docs: refresh README positioning (#167)`) — **re-measured after AMENDMENT 1**, which added three
sites in two test files.

Base was passed **explicitly** as `origin/main` rather than auto-detected. The command's rule would
have resolved `base = HEAD` (the working tree is dirty), but after the first commit that would have
measured only the amendment's three sites. The question this stage answers is about the **whole**
increment that ships, so the fork point is the honest base — making this a re-measure of all nine
sites rather than of the amendment alone.

The first run of this stage used base `7c54820` (the pre-build tip at the time) and also returned
`no-regressions`; `origin/main` has since advanced through the sibling PRs of the same campaign, and
the branch was rebased onto it before this re-measure.

## Partition (computed by `check-regress.mjs scope`, not by judgment)

`scope` exited **0** — `escaped: []`. Every changed path is covered by a declared write, so the build
did **not** escape its plan's `## Files` (fix #7).

**Inside (17 paths)** — the nine product/doc/test files plus the eight pipeline artifacts:

| Path                                                        | Written by                                |
| ----------------------------------------------------------- | ----------------------------------------- |
| `src/lib/constants.ts`                                      | build (plan `## Files`)                   |
| `src/lib/validate.ts`                                       | build (plan `## Files`)                   |
| `src/lib/dest-drift.ts`                                     | build (plan `## Files`)                   |
| `src/lib/symlink-guard.ts`                                  | build (plan `## Files`)                   |
| `docs/roadmap.md`                                           | build (plan `## Files`)                   |
| `tests/validate.test.ts`                                    | build (plan `## Files`, AMENDMENT 1)      |
| `tests/init.test.ts`                                        | build (plan `## Files`, AMENDMENT 1)      |
| `CHANGELOG.md`                                              | build (plan `## Files`)                   |
| `.dev/features/retire-degit-present-tense/PLAN.md`          | `/pharn-dev-plan`, under its own scope    |
| `.dev/features/retire-degit-present-tense/GRILL.md`         | `/pharn-dev-grill`, under its own scope   |
| `.pharn/writes-scope.json`                                  | `set-writes-scope.cjs` (always-writable scratch) |

The last three are **stage artifacts, not build output** — each was written by a stage under the scope
that stage set for itself. They are passed to `--declared` as the patterns
`.dev/features/<name>/**` and `.pharn/**` (the command names `.pharn/**` as always-writable scratch)
so the fix #7 cross-check measures what it is meant to measure: the **eight** files
`/pharn-dev-build` was pinned to once AMENDMENT 1 widened the plan's `## Files`, all eight of which it
wrote and none beyond. `scope` exited **0** again on the widened set — the two test files are
*declared*, so folding them in was a plan amendment, not a scope escape. Had they been edited without
amending `PLAN.md` first, `scope` would have exited 1 with a blocking fix #7 finding, which is exactly
the check working.

**Outside:** 46 test files (`.claude/hooks/*.test.cjs` ∪ `.dev/floor/*.test.mjs`) — verified to cover
the helper's `outside_tests` list exactly, 46/46, with zero uncovered. **0 outside eval pairs** (this
repo has no committed `evals/expected/*.json`; `validate` reports `0 capabilities`).

## Gate set

`tests` + `validate`. **Style gates were skipped by the deterministic rule**, not by choice: `inside`
touches none of `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`, so a style result over the byte-identical outside files cannot flip. The
skip also means the baseline worktree needed no `npm ci`. The identical gate-id set was used on both
sides, as `check-regress.mjs verdict` requires (a mismatch would fail *inconclusive*, never pass).

## Per-gate exit codes

| Gate       | base | head | Result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | no flip |
| `validate` | 0    | 0    | no flip |

Baseline was captured in a throwaway `git worktree` detached at the base SHA (removed afterwards), so
the working tree was never disturbed. Both sides reported **748 tests, 748 pass, 0 fail**.

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` exit **0**, `"verdict": "no-regressions"`. The verdict is the helper's
exit-code comparison, not this document's prose and not the agent's judgment.)

**Honest residual (P0/P7):** this catches exactly what its suite catches — nothing more. The claim is
"deterministically-detectable breakage outside the feature is caught," **not** "nothing broke." Two
things are worth naming for this increment specifically:

1. The outside gate set is the **stdlib** suite (`node --test` over hooks + floor checkers). The
   vitest suite (`tests/*.test.ts`, 1154 tests) is not an outside gate here because the changed files
   are `src/lib/*`, which those tests exercise — that is *inside* coverage and it is `/pharn-dev-verify`'s
   gate, where it ran green.
2. **Nothing in this repo verifies `docs/roadmap.md` at all** — no test, no floor checker, and
   `format:check` covers only `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`. `markdownlint` checks its
   *shape*, never its truth. So one of the six sites rests on human review, which `GRILL.md` raised as
   an important finding and which this report confirms rather than papers over.

`/pharn-dev-regress` certifies **the comparison**, never the feature.
