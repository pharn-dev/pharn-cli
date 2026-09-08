# SHIP — init-cancel-clone-leak

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

Grill F1 is the finding that mattered: `5.2c`'s `exit` handler merged in between and already removes
the clone on this path, which makes the structural fix look optional. It is not — the rule `init.ts`
states in its own header would stay violated, and the next stage added to that `try` would inherit the
trap. The spec forbids leaning on the backstop, and this does not.

F3 is the honest limit: the original bug is unobservable in this harness (`stubProcessExit` throws,
and init's `catch` turns that into exit 1). So the RED was induced backwards — `cancelAndExit()`
re-introduced into the stage, two tests reject with `ProcessExit` instead of resolving. The refactor is
what makes the lifecycle testable at all.

F5 caught collateral: `5.5c` merged nine new boolean assertions on this function hours earlier. All
were converted to exact strings rather than truthiness, so a wrong state fails instead of coinciding.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
