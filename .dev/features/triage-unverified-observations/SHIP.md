# SHIP — triage-unverified-observations

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** (`failing_gates: []`) |

Nine observations, verified against the live tree before any fix: **5 acted on, 4 recorded as
no-action with the reason**. Verdict table in `PLAN.md`; findings in `GRILL.md`; lenses in `REVIEW.md`
(cited, not restated — P4).

The item that turned around is **2**. Its claim is true and its named one-line fix was wrong: adding
`pharn.records.json` to the overwrite-conflict set would have broken a pin that exists on purpose. The
prose moved instead.

Two same-class claims were folded in, both surfaced by other ships and both originally mine — a false
"this fails if a seventh gate is added" in `check-composition.test.ts`, and five call-site comments
still explaining the proxy notice in `degit`'s terms after the dependency was removed.

Item 7's deliverable is outside this repo — `pharn-dev/pharn-oss#180` — because the hook is copied
verbatim by design and must not be forked or patched during the copy.

The floor verdicts above were **re-measured on the current branch state**, after the sixth commit;
the earlier reports predated it.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
