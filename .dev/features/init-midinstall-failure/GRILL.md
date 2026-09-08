# GRILL — init-midinstall-failure (advisory; gates nothing)

For a test-only increment the sharpest question is not "is the code right" — nothing in `src/**`
moves. It is **which of these tests would still pass if the behavior regressed?** Every finding
below is an answer to that, and F1 changed the build.

## F1 — the assertion the spec names cannot see the invariant it is named for

**Problem.** The spec's "Invariants to preserve" says: *"Cleanup-before-exit: the temp clone is
deleted in the `finally`, and every `process.exit`/`cancelAndExit` happens after it (Node skips
`finally` on exit). `expect(cleanup).toHaveBeenCalledTimes(1)` is the assertion that pins it."*

It is not. `stubProcessExit` (`tests/helpers.ts:13-19`) replaces `process.exit` with a function that
**throws** `ProcessExit`. A throw inside a `catch` still unwinds through the enclosing `finally`, so
a regression that hoisted `process.exit(1)` up into the `catch` — the exact production-breaking edit
the invariant exists to prevent — leaves `cleanup` called **exactly once** and every count-based
assertion green. The suite would go on reporting that the invariant held.

This is not a hypothetical reading of the harness. `#151`'s own commit message, landed mid-run,
records the same blind spot from the other side: *"the harness could not reproduce the original bug:
stubProcessExit throws ProcessExit, which init's catch converts into the failure/exit-1 path, unlike
a real process.exit. So the RED was induced backwards."* That PR worked around it once, for its own
cancel case. Nothing generalised the observation.

**Reduction.** Measured, not argued. The build hoists the exit into the `catch` and runs the suite:
`expect(cleanup).toHaveBeenCalledTimes(1)` **passes**; only the new
`expect(cleanupRanBeforeTheReport()).toBe(true)` fails. The helper compares
`cleanup.mock.invocationCallOrder[0]` against `log.error`'s — the first-invocation order is the one
observable that separates "cleanup then report" from "report then cleanup" under a stubbed exit. The
count assertion is kept as well: it catches a deleted `finally`, which the order check alone would
not, since an absent `cleanup` would make the comparison `false` for the wrong reason — hence the
helper's explicit `undefined` guards rather than a bare `<`. Full RED transcript in `VERIFY.md`.

## F1b — and since `#149`, the production consequence is invisible too

**Problem.** The obvious justification for F1 — *"a hoisted exit orphans a multi-megabyte temp
dir"* — stopped being true during this run. `#149` (`3bbbb5f`) registers every clone in a
process-wide set drained by `exit`/`SIGINT`/`SIGTERM` handlers, so the backstop reclaims the dir
even when the `finally` never runs. An honest grill has to ask whether the pin still earns its
place once its headline symptom is gone.

**Reduction.** It earns *more*. `#149`'s commit message states the rule itself: the backstop is
*"deliberately not relied on: a backstop that hides a structural bug leaves the next stage added to
that `try` with the same trap and nothing to catch it."* After `#149` the primary mechanism can stop
working with **nothing observable to say so** — not the temp dir, not the exit code, not the call
count. The ordering assertion is now the only observable there is. The test comment and the
guarantee audit were both rewritten to say this, rather than keeping the more dramatic and now-false
"orphans a temp dir" claim.

## F2 — three cases, one throw path: two of them are nearly the same test

**Problem.** `parseCapabilityIndex` and `runInstallArchetype` are different statements in the same
straight-line `try`. Once the `catch` is entered, nothing downstream distinguishes them: identical
box, identical `reportFatal`, identical `exit(1)`. A reader could reasonably ask whether the second
case earns its place, and a suite that mistakes "two throw sites" for "two behaviors" invites a
third and a fourth that add nothing.

**Reduction.** They are kept because their *pre-throw* assertions differ, and that is the whole
content: case 1 asserts the writer was **never called** (a malformed clone must not write), case 2
asserts the writer **was** called exactly once (this is the partial-tree case — the user is left
with files on disk and the exit code is their only signal). Neither could stand in for the other.
The line is drawn there deliberately: `resolveCapabilities` and `unknownCapabilitiesWarning` are
*not* given cases, because their pre-throw assertions would be a copy of case 1's — they would cover
the mock, not `init`. The guarantee audit records that as PARTIAL rather than claiming the `catch` is
exhaustively exercised.

## F3 — the `PHARN_DEBUG` assertion could pass for the wrong reason

**Problem.** `expect(informed()).toMatch(/PHARN_DEBUG/)` is a substring match over every `log.info`
line of the run. `log.info` is also how `cancelAndExit` prints "Cancelled. Nothing was changed."
and how several other lines reach the user. If a future refactor moved the string `PHARN_DEBUG`
into any of those, the assertion would go on passing while the affordance had been removed from the
failure path — a pin that has silently stopped pinning (P5: fail closed).

**Reduction.** Bounded, not closed, and the bound is measured: dropping the cause argument
(`reportFatal(errorMessage(failure.err))`) turns `informed()` into the empty string and both cases
go RED — so nothing else in a failure run currently emits it. The assertion is deliberately loose
per the spec ("match loosely, not the exact sentence"), because the sentence is
`report-error.ts`'s `PHARN_DEBUG_HINT` and re-encoding it here would fail on a rewording that broke
nothing. The stricter pin already exists one level down, in the `report-error` unit tests, and the
per-call-site *stream* contract is pinned once at `tests/init.test.ts:196`. Duplicating either here
would pin the reporter rather than `init`.

## F4 — hoisting `informed()` touches a block this increment was told to leave alone

**Problem.** The helper was declared inside the `fatal-error reporting` describe. Moving it to the
parent edits code the spec did not ask to change, and a shared helper across two describes couples
them: a later refactor of one block can now break the other.

**Reduction.** Checked against what the spec actually fenced off — the **TTY gate tests** and the
**cancel cases**, neither of which is touched. The alternative was a verbatim second copy of a
five-line helper in an adjacent describe, which is the shape that goes stale. The coupling is real
but one-directional and trivial (a pure read of `log.info`'s call list); the file already has a
third, inline formulation of the same expression at the MIN_CLI case, which is left alone rather
than swept into this increment. Both blocks now go RED together if the helper breaks, which is the
correct behavior for a helper both depend on.

## F5 — `throw undefined` pins a comment, and comments are not requirements

**Problem.** Eval 5 exists because `init.ts` *says* the cause is boxed so a thrown `undefined` stays
distinguishable from success. Writing a test whose only justification is a code comment risks
freezing an implementation detail: if the box were replaced by a `hasFailure: boolean` flag, the test
would fail on a change that preserved every user-visible behavior.

**Reduction.** It would not — and that is why the case asserts an **outcome**, not a shape. It
throws `undefined` and asserts `exit(1)`; a `hasFailure` flag passes it, a `let failure: unknown`
does not. The measurement: unboxing the cause to `let failure: unknown = null` leaves the other 23
cases green and fails this one alone, with `ProcessExit(0)` where `1` was expected — i.e. `pharn
init` reporting **success**, as a cancel, on a run that crashed. That is a user-visible bug no other
test in the repo detects, so the case is pinning a behavior, not a comment.

## Verdict

**Advisory: proceed.** F1 changed the build and is the increment's main content — the spec's named
assertion is insufficient for the invariant the spec names, and the replacement was validated by
breaking the source. F1b changed the *justification*, not the code: the pin's headline symptom
disappeared mid-run and the writing was corrected instead of left overstated. F2 and F3 are honest
scope limits recorded in the guarantee audit. F4 is a deliberate, bounded edit outside the strict
brief. F5 clears a "this only pins a comment" objection by measurement.
