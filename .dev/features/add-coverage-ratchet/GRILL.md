# GRILL — add-coverage-ratchet (advisory; gates nothing)

## F1 — a coverage ratchet is the easiest place in the repo to state a false guarantee

**Problem.** Raising the floors invites writing "coverage is now enforced at 97%", which reads as a
quality claim. Coverage measures **which lines executed**, never whether the assertions on them are
worth anything. This very bundle demonstrates the gap: three axes moved because tests were *added*,
and an added test nobody mutation-checked lifts the number while defending nothing.

**Reduction.** The guarantee audit says the ratchet is FLOOR only **at the moment of measurement**,
and the rewritten `vitest.config.ts` comment says what the numbers are (a ratchet against deletion),
not what they prove.

## F2 — a floor set to the measured value is a trap for the next contributor

**Problem.** The obvious ratchet is "set the floor to what we measured". Coverage fluctuates by
fractions between runs and machines, so the next unrelated PR reddens on a threshold nobody
associates with their change — and the fix is to lower a floor, which teaches exactly the wrong reflex.

**Reduction.** Round **down** to the whole number, as the spec instructs. 97.06 → 97, 92.48 → 92,
97.55 → 97, 97.92 → 97.

## F3 — the ambiguity pin's real risk is that it passes for the wrong reason

**Problem.** `runAdd('dup')` rejecting with `ProcessExit(1)` proves almost nothing on its own — a
dozen unrelated failures produce the same rejection, including a fixture that never resolved anything.

**Reduction.** The message must name **both** addresses (`/griller:dup/` and `/lens:dup/`), and the
positive companion must prove the error is *escapable by the exact address it names*. That pair is
the contract; either alone is decoration. Mutation-verified: widening the guard to `> 99` reddens the
hard-fail with `promise resolved "undefined" instead of rejecting`.

## F4 — the two clone-failure cases could pass with the clone never attempted

**Problem.** "`exit(1)` when the clone fails" is satisfied by any earlier refusal — a bad config, a
failed gate — so the test could be green while never reaching the catch it targets.

**Reduction.** Each asserts the specific thing that could only be true *after* the fetch was
attempted and *before* anything downstream ran: the named path asserts `parseCapabilityIndex` was
never called, the picker path asserts `groupMultiselect` was never called. The second is the more
interesting invariant — the user is never asked to choose from a menu the command cannot serve.

## F5 — the ratchet must be measured on the FINAL tree, not this branch's

**Problem.** Measuring before the rest of the bundle merged would set floors that the later merges
immediately made stale — and the spec's whole reason for putting the ratchet in this prompt is that it
happens once.

**Reduction.** `5.6a` (#150), `5.6b` (#153) and `4.04` (#151) are all merged; this branch is cut from
that `main`, and the measurement was taken here with the five new tests in place.

## Verdict

**Advisory: proceed.** F1 shapes what the config comment is allowed to say; F3 and F4 are what stop
three of the five pins from being green for reasons unrelated to their subject.
