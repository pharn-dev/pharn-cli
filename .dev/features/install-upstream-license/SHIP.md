# SHIP — install-upstream-license

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The grill's second finding turned the headline test from a tautology into a real one: with identical
bytes on both sides, "the user's LICENSE is unchanged" would pass no matter which file won. It now
uses distinct content, and was verified to fail against the identity mapping.

Raised upstream, not done here: shipping the license inside the mirrored tree (`pharn/LICENSE`) plus a
short `NOTICE` would let the pharn layout drop the mapping entirely.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
