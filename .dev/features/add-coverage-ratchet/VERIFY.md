# VERIFY — add-coverage-ratchet

**FLOOR layer** — `check-verify.mjs` over the six gates: all 0 → **`PASS`**, `failing_gates: []`.
Separately, `npm run test:coverage` exits 0 against the new floors.

**ADVISORY layer** — no `role: verifier` capabilities exist (P7).

**Two of the five pins were mutation-verified, and the third attempt is the one worth recording:**

```
# widen the ambiguity guard so it can never fire
-  if (matches.length > 1) {
+  if (matches.length > 99) {
× hard-fails on an ambiguous bare name, listing both role:name addresses
AssertionError: promise resolved "undefined" instead of rejecting

# turn the picker's cancel into an error outcome
-  if (isCancel(picked)) return { kind: 'cancelled' };
+  if (isCancel(picked)) return { kind: 'error', message: 'x' };
× the picker cancel exits 0 — a user cancel is not a failure
AssertionError: expected ProcessExit(1) to match object ProcessExit(0)
```

**The first ambiguity mutation silently did not apply** — the match string had the wrong indentation,
so nothing changed and the test passed. That outcome is *indistinguishable* from a pin that does not
bite. A mutation you have not confirmed landed is worth nothing; the RED above is from the corrected
attempt.

**What the ratchet does and does not mean.** It catches a **deletion** — an error-path suite removed,
a branch that stops being exercised. It is not a quality bar: coverage records which lines ran, never
whether the assertions on them are worth anything. Three axes moved across this bundle because tests
were *added*, and an added test nobody mutation-checked lifts the number while defending nothing.

Floors are the measured values rounded **down**, on the final tree with every bundle PR merged. A
floor set to the measured value would redden an unrelated PR on a fractional fluctuation, and the fix
for that looks like "lower the floor" — the reflex a ratchet exists to prevent.
