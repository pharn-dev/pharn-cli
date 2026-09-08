# SHIP — exclude-floor-test-fixtures

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The grill's second finding — that an "ancestor named test-fixtures" case is not a pin unless it can
actually be BUILT — is what produced the increment's most valuable test. See `REVIEW.md`.

Raised upstream, not done here: `pharn/floor/` mixes runtime checkers with test apparatus; a
dedicated `__tests__/` or a fixtures sibling outside the shipped dir would make the boundary
structural rather than filter-shaped.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
