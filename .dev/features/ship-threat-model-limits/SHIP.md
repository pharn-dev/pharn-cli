# SHIP — ship-threat-model-limits

## Stages run, in order

`/pharn-dev-plan` → [GATE 1] → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` →
`/pharn-dev-verify` → `/pharn-dev-review` → **GATE 2 (here)**. Ended at GATE 2.

## Structural verdicts read, verbatim

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `validate.mjs` exit code | **0** |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`no-regressions`** |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`PASS`** |

## Outstanding upstream work (reported, not done here)

The spec's `#### Upstream coordination` half is **not** in this increment and is not claimed by it:
`pharn-dev/pharn-oss` must ship user-scoped `pharn/THREAT-MODEL.md` + `pharn/LIMITS.md`, repoint the
command / floor / contract citations at those paths, and replace the ROOT-anchored
`THREAT-MODEL.md` / `LIMITS.md` entries in `protect-trusted-paths.cjs`'s `DEFAULT_PROTECTED`. Until
then this change is inert, which the P7 test pins.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
