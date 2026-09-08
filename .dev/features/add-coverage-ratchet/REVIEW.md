# REVIEW — add-coverage-ratchet

## Lens 1 — P0 (a number is not a guarantee)

**PASS, and this was the increment's main risk.** Raising floors to 97 invites "coverage is enforced
at 97%", which reads as a quality claim it cannot support. The rewritten `vitest.config.ts` comment
says what the numbers are — a ratchet against deletion — and says outright that coverage records which
lines ran, never whether anything was checked. This bundle is its own evidence: three axes moved
because tests were *added*.

## Lens 2 — P5 (a pin that passes for the wrong reason is not a pin)

**PASS.** `runAdd('dup')` rejecting with `exit(1)` proves almost nothing alone — a dozen unrelated
failures produce the same rejection. The ambiguity case therefore asserts the message names **both**
addresses, and its positive companion proves the error is escapable by the exact address it names.
Likewise the two clone-failure cases assert what could only hold after the fetch was attempted and
before anything downstream ran (`parseCapabilityIndex` never called; `groupMultiselect` never called).

The mutation work surfaced a lesson worth keeping: the first ambiguity mutation **did not apply** —
wrong indentation — and the test passed, which is indistinguishable from a pin that does not bite. A
mutation you did not confirm landed is not evidence.

## Lens 3 — P7 (scope: the source is not the problem)

**PASS.** `src/commands/add.ts` is untouched. The branches were correct; they were untested. The spec
says so and the diff confirms it.

## Lens 4 — the ratchet's own trap

**PASS.** Rounding **down** is the difference between a ratchet and a tripwire: a floor equal to the
measured value reddens the next unrelated PR on a fractional run-to-run difference, and the natural
fix — lowering a threshold — is exactly the habit the ratchet exists to prevent. The comment records
the previous slack (up to 10 points) so the change is legible later.

**Advisory finding (low).** `npm run check` runs `test`, not `test:coverage`, so a contributor can be
locally green and still redden CI's `Test` job on a threshold. That divergence is deliberate and is
already documented as one of `check`'s two named gaps — but it is now a slightly sharper edge than it
was with 10 points of slack.

## Floor-gate vs advisory split

- **Floor:** six gates green; `validate.mjs` 0; `test:coverage` exit 0 against the new floors; two
  mutation-verified pins.
- **Advisory:** one low finding (`check` vs `test:coverage`).
