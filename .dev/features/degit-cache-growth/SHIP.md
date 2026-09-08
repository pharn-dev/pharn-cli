# SHIP — degit-cache-growth

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

**Option A only, and the spec says so itself:** `5.3a` merged first and removed degit, so Option B's
prune would be dead code against a cache nothing writes.

The grill's F1 narrowed this to the half `5.3a` had not covered — the growth mechanism — rather than
re-delivering a section that already exists. F3 found a real defect in text `5.3a` shipped: "delete it
yourself" named the **top-level** shared degit cache, which destroys other tools' caches if followed
literally.

`## Evals to write` is empty on purpose, with the reason recorded: the only floor-grade claim nearby
(`pharn no longer grows the cache`) is `5.3a`'s and is verified there.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
