# SHIP — models-block-honesty

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

The grill's F1 found the plan's headline eval had no harness — `tests/init-archetype.test.ts` mocked
`outro` and never read it back — so an `outroBody()` helper was added, mirroring
`tests/status.test.ts`'s `noteBody`. F2 turned a bare negative assertion into a two-directional pin,
and the pin was then verified RED against a revert of the outro string.

F4 predicted the markdown table would fight the edit; it did — MD060 flagged the new row's pipe
alignment, and the row was re-fitted to the table's existing 187-column width rather than reflowing
every row into the diff.

Not done here, reported: `docs/commands/init.md:134` mentions `models` without the Coming-soon signal
(true as written, so left alone); `docs/commands/status.md` still does not mention MODELS at all.

Findings in `REVIEW.md` and `GRILL.md` are advisory free-text — cited, not restated (P4).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
