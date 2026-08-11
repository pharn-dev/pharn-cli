# SHIP — lint-gate-no-soft-tier (roll-up; ADVISORY)

Gated `/pharn-dev-ship` run (no `--loop`). Base: `dd8af181cea7188dfa64977b76248291f4b9e85a` (`dd8af18`).

## Stages that ran, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; ended at its own approval halt — **GATE 1** |
| 2 | `/pharn-dev-grill` | `GRILL.md` written; advisory, gates nothing — proceeded regardless |
| 3 | `/pharn-dev-build` | 6 files written; floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` written |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` written |
| 6 | `/pharn-dev-review` | `REVIEW.md` written |

**Where the run ended:** at **GATE 2** — the post-review human decision. No stage returned a non-GREEN
verdict, so there was no RED-verdict STOP.

**GATE 1 was hit and answered by the human** (2026-08-11): plan *approved as written*, plus two
resolutions — globals set → `globals.nodeBuiltin` (global placement); offered assertion test → yes,
build it. The plan records both, with the original question wording kept.

## Structural verdicts read, verbatim

These, and only these, decided proceed/stop. Each is a deterministic-tool output (an int or an enum
string); no free-text entered the control flow.

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** (GREEN) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`no-regressions`** |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`PASS`** |

Supporting floor detail, for the human's convenience only (not additional verdicts): `/pharn-dev-build`'s
`npm run check` exited 0 (643 tests, 40 files); `/pharn-dev-regress` compared 5 outside gates
(`tests`, `validate`, `lint`, `format:check`, `lint:md`) at base and HEAD, all `0 → 0`, with
`regressions[]` and `pre_existing[]` both empty; `/pharn-dev-verify`'s `failing_gates[]` was empty and
`verifiers.registered` was 0.

`check-regress.mjs scope` also exited **0**, confirming no changed path escaped the plan's declared
`## Files` (no fix #7 breach).

## Advisory artifacts — pointers, not restatements (P4)

- `.dev/features/lint-gate-no-soft-tier/REVIEW.md` — the four-lens review. **Verdict: GREEN, 0
  floor-gate (blocking) findings**; 1 important + 3 minor advisory findings, one observation, and one
  proposed lesson candidate. Read it there; it is not restated here.
- `.dev/features/lint-gate-no-soft-tier/GRILL.md` — the pre-build interrogation, advisory, gated
  nothing. 7 concerns (0 blocking-severity). Three were folded into the build within the approved
  `## Files`; one (F7) was **refuted by measurement** during the build rather than accepted.
- `.dev/features/lint-gate-no-soft-tier/REGRESSION.md` and `VERIFY.md` — the human renders of the two
  machine verdicts above, each carrying its own honest-residual line.

A proposed lesson candidate sits in `REVIEW.md` (the zsh word-splitting / exit-code-capture trap, caught
live during the regress baseline). It is **proposed only** — canon is written solely by a separate,
human-gated `/pharn-dev-memory-promote` run.

## Guarantee audit for this run (P0)

- Running the stages in order → **ADVISORY**. Nothing on the floor forced the sequence; the agent
  invoked each stage.
- Reading a verdict and stopping on it → the **verdicts** are FLOOR (each sub-stage's own checker);
  the **act** of reading them is ADVISORY orchestration.
- The two human gates preserved → **ADVISORY** (command discipline), not a floor mechanism.
- `/pharn-dev-ship` writes only `SHIP.md` → **FLOOR: hook (fix #7)**, `set-writes-scope.cjs` +
  `enforce-writes-scope.cjs`.
- **Net:** this gated run introduced **zero** new floor primitive. Every guarantee above belongs to a
  sub-stage.

---

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
