# SHIP — triage-unverified-observations

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

Nine observations, verified first, fixed only where the claim held: **5 acted on, 4 recorded as
no-action**.

The one that turned around is **item 2**. Its claim is true and its named one-line fix was wrong:
adding `pharn.records.json` to the overwrite-conflict set would have broken a pin that exists on
purpose. The prose moved instead.

Grill F4: items 5, 6 and 8 all tempt the single CI edit that renames a required context and blocks
every PR. Nothing under `.github/` was touched, and the trap is documented beside the gap.

Item 7's deliverable is outside this repo — `pharn-dev/pharn-oss#180` — because the hook is copied
verbatim by design and must not be forked or patched during the copy.

Folded in: a false claim in `tests/check-composition.test.ts`, found by `5.6d`, from my own earlier
PR. Exactly the class the nine belong to.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
