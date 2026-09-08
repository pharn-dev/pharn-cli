# SHIP — remove-yes-contract

Stages: plan → [GATE 1] → grill → build → regress → verify → review → **GATE 2 (here)**.

| stage | verdict source | value |
| --- | --- | --- |
| build | `validate.mjs` exit | **0** |
| regress | `regression-report.json` `.verdict` | **`no-regressions`** |
| verify | `verify-report.json` `.verdict` | **`PASS`** |

## What the grill changed

F1 changed the build: the spec's acceptance criteria name "the three dispatch cases at lines 67-83" of
`tests/index.test.ts`, and a live grep found **five** assertions pinning `runRemove`'s call shape —
the three named plus the numeric-positional pin and the bare-`remove` picker-branch pin, both
spelling `{ yes: false }`. Following the spec literally would have shipped two red tests.

F3 changed how the new structural pin is written: the parameter-list regex is asserted **defined**,
and the parameter count asserted at exactly 1, so a rename or a reformat that stops the regex matching
fails loudly instead of passing on an empty capture (P5).

F4 cleared a blocking-looking concern: `runRemove` is an `export`, but `package.json` ships
`files: ["dist"]` with a single `bin` and no library entry point, so dropping a parameter is not an
API break and `### Fixed` is the honest CHANGELOG tier.

F2 and F5 were recorded as scope limits rather than fixed: no gate can read prose (the only structural
defense against re-drift is that the parameter is gone), and `pharn remove --yes` is still silently
accepted — bounded by the fact that the picker's confirm defaults to No, and assigned to the
per-command flag allowlist that FABLE 4.5 will bring.

## Evidence

The pins were written first and confirmed RED on the unmodified tree (6 failed | 63 passed), quoted in
`VERIFY.md`. The three CLI transcripts there were taken from the built binary, because nothing in the
suite runs it.

One environment fault, unrelated to the change, is documented in `REGRESSION.md`: the shared
`node_modules` lost the declared `degit` dependency mid-run; it was restored and **both** base and head
were re-measured so the comparison is over one environment.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
