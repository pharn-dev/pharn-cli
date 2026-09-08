# SHIP — add-coverage-ratchet

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** (`failing_gates: []`) |

Five pins over `add`'s untested control flow, then the bundle's **one** ratchet: 90/82/95/92 →
**97/92/97/97**, the final tree's measurements rounded down.

This is the last increment of the bundle, which is why the ratchet lives here — measuring earlier
would have meant measuring twice and discarding the first answer. The floors were re-measured after
`6.2` merged, not carried over from the pre-rebase run.

`GRILL.md` F1 constrains what the config comment is allowed to claim; F3 and F4 are what stop three of
the five pins from passing for reasons unrelated to their subject. `VERIFY.md` records a mutation that
silently did not apply — a green test that proves nothing, caught and redone.

Findings cited, not restated (P4): see `GRILL.md` and `REVIEW.md`.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
