# SHIP — contributing-six-gates

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The spec marked "add `lint:md` to `npm run check`" optional. It was taken, because listing six
commands in `CONTRIBUTING.md` documents the gap and does not close it — the reported failure is a
contributor who runs the documented gates green and still gets a red required check.

Grill F1 named the increment's real risk: a fix that then claims `check` *is* CI repeats the exact
sin being fixed. `check` still skips `build` and still runs `test` not `test:coverage`; both are
pinned as assertions and stated in all five prose surfaces.

The composition pin was RED first (`expected [...] to include 'lint:md'`), and `check` was
demonstrated against a planted markdown error — 1 broken, 0 restored.

Knock-on named, not hidden: `prepublishOnly` is `npm run check`, so releases now require
markdownlint-clean docs.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
