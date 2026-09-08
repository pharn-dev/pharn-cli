# SHIP — ruleset-contract-pins

## Verdict table

| Stage    | Source                                    | Verdict                                 |
| -------- | ----------------------------------------- | --------------------------------------- |
| build    | `npm run check` + `npm run build` + floor  | GREEN — 6 gates + build, `validate` 0    |
| regress  | `check-regress.mjs verdict` (exit 0)       | `no-regressions` — 0 regressions, 0 pre-existing |
| verify   | `check-verify.mjs` (exit 0)                | `PASS` — `failing_gates: []`             |

Gate detail: `format:check` 0 · `lint` 0 · `lint:md` 0 · `typecheck` 0 · `test` 0 (52 files, 1068
tests) · `validate` 0 · `build` 0. Baseline `5955351`, changed files `tests/ci-workflow.test.ts`.

## What the grill changed

Four of five findings changed the artifact, not just the prose:

1. **Finding 1** forced `REQUIRED_CONTEXTS` to hold LITERALS. The first design derived the CodeQL
   member from `codeql.yml`, which would have made the constant self-updating — rename the template
   and the set equality still holds, proving nothing. The workflow-derived value is now compared
   against the literal instead of substituted for it.
2. **Finding 2** added the non-vacuity guard. `expect(blocks.size).toBe(1)` runs BEFORE
   `expect(jobNames).toEqual([])`, and both decoys are asserted present in the source — otherwise a
   parse that read nothing would satisfy the increment's whole point while green.
3. **Finding 3** changed the EVIDENCE requirement: the pre-existing `ci.yml` cases got their own RED
   demonstration (rename `Markdown lint`), because the refactor — not the new pins — was the real
   risk of silently loosening the one pin that already worked.
4. **Finding 5** turned a third deferral of the gate-list consolidation into a decision with
   reasons, and promoted the false comment at `tests/check-composition.test.ts:81` into a named
   residual in the guarantee audit and the PR body.

Finding 4 (the increment adds a new over-claim surface) produced the three-place limit statement in
the test file rather than a code change.

## The hole, demonstrated

At the base commit, adding `name: Floor` to `floor.yml` — an edit that reads as a UI improvement and
silently renames a required status check from `floor` to `Floor`, merge-blocking every PR with
nothing red to fix — left `tests/ci-workflow.test.ts` GREEN at 4/4. Post-change it is RED:
`expected [ 'Floor' ] to deeply equal []`. Five further mutations red their own pin; all six are
tabulated in `VERIFY.md`, and every scratch edit was restored (`git status` clean but for the one
test file and this feature folder).

## Named limits carried forward

- **Half the contract stays unpinned.** Nothing reads the live `main` ruleset. The nine strings are a
  declared belief, hand-checked once during discovery (they matched). A ruleset edited on github.com
  still drifts silently, and a ruleset requiring contexts NO workflow produces — the original
  incident — remains invisible from inside the repo.
- **Three CI-gate lists remain** (`ci-workflow.test.ts`, `dev-script.test.ts`,
  `check-composition.test.ts`). Deliberately not consolidated; reasons in `PLAN.md`.
- **`tests/check-composition.test.ts:81` carries a false comment** and is not fixed here (P7).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
