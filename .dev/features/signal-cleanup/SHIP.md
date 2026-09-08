# SHIP — signal-cleanup

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

Grill F1 shaped the evidence: the defect is the **exit code**, not just the leaked directory, so the
test had to be a real child process that observes exit status. Shown RED with the handlers disabled
(`expected true to be false` — the clone survived).

F3 caught what would have been a production hang: re-raising re-enters the same signal, and
`@clack/prompts` leaves a listener that prints and returns — `removeAllListeners` must precede the
re-raise or the process hangs instead of dying.

F2 was a real bug in the first draft of the tests: a once-only latch makes them order-dependent, and
two cases failed for reasons unrelated to the code until each got a fresh module instance.

F5: the spec still describes degit options that `5.3a` removed. The lifecycle defect is unchanged, so
the fix applies verbatim; only the spec's prose is stale.

F6: the optional startup sweep is deliberately **not** built — a new deletion surface outside the
project for a set that stops growing once the leak closes.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
