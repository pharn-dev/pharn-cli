# SHIP — init-midinstall-failure

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

## What the grill changed

**F1 changed the build, and it is the increment's main content.** The spec names
`expect(cleanup).toHaveBeenCalledTimes(1)` as "the assertion that pins" cleanup-before-exit. It is
not: `stubProcessExit` turns `process.exit` into a **throw**, and a throw inside a `catch` still
unwinds through the enclosing `finally` — so hoisting `process.exit(1)` up into the `catch` leaves
that count at exactly 1 and the assertion green. `#151`'s own commit message records the same blind
spot from the other side ("the harness could not reproduce the original bug… so the RED was induced
backwards"), having worked around it once for its own case. The build added
`cleanupRanBeforeTheReport()`, comparing `cleanup`'s first `mock.invocationCallOrder` against
`log.error`'s, and validated it by making the break: line 265 (`toHaveBeenCalledTimes(1)`)
**passed** while line 266 (the ordering check) **failed**. Followed literally, the brief would have
shipped a test that asserts an invariant it cannot observe.

**F1b changed what the PR claims, not what it does.** The obvious justification — "a hoisted exit
orphans a multi-megabyte temp dir" — stopped being true mid-run: `#149` added an exit/signal
backstop that reclaims the clone anyway. The pin earns more, not less, for it — after `#149` the
primary mechanism can stop working with *nothing* observable to say so, and `#149` itself says its
backstop must not become the thing that hides a structural bug. The test comment, the guarantee
audit and the PR body were rewritten to say that instead of the more dramatic, now-false claim.

**F5 justified a third case the spec did not ask for.** `throw undefined` is legal JavaScript, and
`init.ts` boxes the cause specifically so a nullish throw stays distinguishable from "nothing
failed". Unboxing it to `let failure: unknown` leaves 23 of 24 cases green and fails only that one —
`pharn init` exiting **0**, as a cancel, on a run that crashed. It pins a user-visible outcome, not
a comment.

**F2 and F3 were recorded as scope limits rather than fixed.** The `catch` is not exhaustively
exercised (two of four throw sites; the other two would cover the mock, not `init`), and the
`PHARN_DEBUG` assertion is a loose `/PHARN_DEBUG/` match that could in principle pass for an
unrelated reason — bounded by the measurement that dropping the cause makes the whole `log.info`
stream empty. Both sit in the plan's guarantee audit as PARTIAL, not FLOOR.

**F4 justified one edit outside the strict brief** — hoisting `informed()` one describe level rather
than pasting a second copy of it.

## Evidence

Four breaks, four distinct REDs, all transcribed in `VERIFY.md`: a swallowing `catch` (3 failures,
and the tell-tale **21 passed** showing the pre-existing suite was entirely blind), the hoisted exit
(2 failures, the count assertion green), the unboxed cause (1 failure), and the dropped cause
(2 failures, `Received: ""`). `src/commands/init.ts` went from `150,163-164` uncovered to 100% on
all four axes — measured, not gated; the ratchet is 5.6c's.

## Spec drift found and reported

Every line number in the spec is stale, and two structural claims were too: the `catch` no longer
stores a flattened message with a hand-rolled debug hint (it boxes the cause and defers to
`report-error.ts`), and `degit` is gone from the fetch path entirely — the failure this pins is
unaffected, since it lives wholly after `fetchRepo` returns.

**And the base moved under the branch, twice.** `#151` landed the spec's own conditional
(`confirmWriteTargets` retyped to `'proceed' | 'decline' | 'cancel'`), `#149` landed the temp-clone
backstop, `#152` landed a workflow-name pin. The first CI run caught the first of these as a RED
typecheck on the merge ref. The branch was rebased onto `4972abb`, the mock re-armed, and every RED
transcript re-taken there — a rebase that silently replaced the evidence would have left this PR's
central claim unmeasured. All recorded in `PLAN.md`'s Discovery and `REGRESSION.md`.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
