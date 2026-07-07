# SHIP — input-validation lens (roll-up; advisory)

`/pharn-dev-ship` (gated mode) ran the build loop in order for the increment `input-validation-lens`
(advisory-only `role: lens` at `pharn-review/input-validation/` + 3 evals). This is a **roll-up**, not a
decision.

## Stages run, in order, and where the run ended

| stage                | ran | outcome                                                                           |
| -------------------- | --- | --------------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | ✅  | PLAN.md written; halted at **GATE 1**                                             |
| **GATE 1 (human)**   | ✅  | human **approved** the plan (advisory-only floor shape; P7/overlap acknowledged)  |
| `/pharn-dev-grill`   | ✅  | GRILL.md — advisory, gates nothing (5 concerns: 0 blocking, 3 important, 2 minor) |
| `/pharn-dev-build`   | ✅  | 10 files written; floor GREEN                                                     |
| `/pharn-dev-regress` | ✅  | regression-report.json — `no-regressions`                                         |
| `/pharn-dev-verify`  | ✅  | verify-report.json — `PASS`                                                       |
| `/pharn-dev-review`  | ✅  | REVIEW.md — GREEN, 0 floor-gate findings, 4 advisory (minor)                      |
| **GATE 2 (human)**   | ⏳  | **run ends here — awaiting the human's merge / fix / abandon decision**           |

The run ended at **GATE 2** (the post-review human gate), the intended terminal for a gated `/pharn-dev-ship`.

## Structural verdicts read, verbatim (the FLOOR-grade proceed/stop inputs)

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code = **0** (GREEN — 17 capabilities, 16 → 17).
- `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`no-regressions`**.
- `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`PASS`** (gates: test, validate, lint, format:check,
  lint:md all 0; 0 verifiers registered; no `structural:*` gate — the feature ships no committed actual
  `findings.json` yet).

Each verdict was the deterministic proceed/stop input at its stage (`/pharn-dev-ship` adds no new floor
primitive; every guarantee belongs to a sub-stage). No stage returned a non-GREEN verdict, so there was no
RED-verdict STOP.

## Pointers (cited, not restated — P4)

- `.dev/features/input-validation-lens/REVIEW.md` — the 4-lens advisory review + a proposed lesson (zsh
  `node --test $LIST` word-splitting hazard; human-gated promotion only).
- `.dev/features/input-validation-lens/GRILL.md` — advisory pre-build interrogation.
- `.dev/features/input-validation-lens/{regression-report.json, verify-report.json}` — the machine verdicts.

## The standing decision is the human's

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or apply
the `PHARN ✓ reviewed` seal.

**Follow-up on file (from GATE 1):** if you want the deterministic `scan-code-input-validation.mjs` scanner, it
is a **separate increment** (a new floor primitive = a distinct axis; one axis / one PR) — say the word and I'll
`/pharn-dev-plan` it.
