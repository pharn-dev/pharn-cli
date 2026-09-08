# SHIP — install-features-readme

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

Notable: the grill asked for the writer/mirror symlink postures to be tested where they DISAGREE.
Measuring that turned up a real hole (a symlinked `features/` parent copies bytes from outside the
clone) which the build closed and pinned. See `REVIEW.md`.

Raised upstream, not done here: confirm `pharn-dev/pharn-oss` intends `features/README.md` as
installed product surface (its text is user-addressed, so this is a confirmation).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
