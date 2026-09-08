# SHIP — npm-run-dev

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The grill's F1 caught a wrong claim in the spec itself: it says `CLAUDE.md` asserts the absence of a
`dev` script "in two places". A live grep finds one (`CLAUDE.md:14`). One site was edited; no prose
was invented to fill a second.

F2 is the honest limit of this increment — the test pins the script's spelling, not its behavior.
The argv forwarding was checked by hand and the transcript is in `VERIFY.md`; it is not a gate.

The test was written first and confirmed RED on the pre-change tree
(`expected undefined to be 'tsx src/index.ts'`).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
