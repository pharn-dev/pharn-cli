# GRILL — init-cancel-clone-leak (advisory; gates nothing)

## F1 — the backstop merged since the spec makes it tempting to skip this entirely (scope trap)

**Problem.** `5.2c` added `exit`/`SIGINT`/`SIGTERM` handlers that drain live clones, and
`cancelAndExit` is a `process.exit(0)` — so the handler already removes the clone on this path. One
could argue the leak is fixed and close the prompt.

**Reduction.** Rejected, and the spec forbids it in as many words ("do not delete that work or lean on
this backstop for it"). The design rule `init.ts` states in its own header — every exit happens AFTER
the `finally` — would remain violated, and the next stage added to that `try` would inherit the same
trap with nothing to catch it. A backstop that hides a structural bug is worse than no backstop.

## F2 — a boolean cannot express the third state, and that is how the bug happened (root cause)

**Problem.** `Promise<boolean>` has no room for "cancelled", so the only way to signal it was to exit.
A fix that keeps the boolean and adds an out-param, or maps cancel onto `false`, re-creates the
pressure that produced the exit.

**Reduction.** Three named states, with `decline` and `cancel` kept **distinct** even though `init`
maps both to `cancelled`. The comment says why, so a future reader does not "simplify" them back.

## F3 — the test harness cannot reproduce the original bug (honest limit, worth writing down)

**Problem.** `stubProcessExit` throws `ProcessExit` rather than terminating. In `init`, that throw is
caught by the surrounding `catch` and turned into the failure/exit-1 path — so a pre-fix test would
have observed exit 1, not a leak. The bug is literally unobservable in this harness.

**Reduction.** The RED demonstration runs the other way: re-introduce `cancelAndExit()` in the stage
and watch the *stage's own* tests reject with `ProcessExit` instead of resolving. That is the exact
regression, observed at the layer where the harness can see it — and it is why the refactor, not a
new test, is what makes the lifecycle testable at all.

## F4 — deleting `confirmWarning` is right, but check the caller set first (dead-symbol discipline)

**Problem.** Removing an exported helper on the assumption it is unused is how a build breaks.

**Reduction.** `grep -rn confirmWarning src/` → `overwrite-check.ts` only, and after the refactor,
none. Its `tests/confirm.test.ts` block goes with it, per the repo's precedent (commit 2cd061d).
`warnAndConfirm` also has no `src/` callers but is deliberately left — one deletion per reason.

## F5 — a stale boolean assertion elsewhere would pass silently (collateral)

**Problem.** `5.5c` merged a batch of new `confirmWriteTargets` cases hours before this change, all
asserting `true`/`false`. `toBe(true)` against `'proceed'` fails loudly — but `toBeTruthy()` would
NOT have, and a mixed suite could have hidden a wrong mapping.

**Reduction.** All nine assertions were converted to the exact string, not to truthiness, so a wrong
state is a failure rather than a coincidence.

## Verdict

**Advisory: proceed.** F1 is the finding that matters — the backstop makes this look optional and it
is not.
