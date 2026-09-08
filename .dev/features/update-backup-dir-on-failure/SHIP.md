# SHIP — update-backup-dir-on-failure

A roll-up of one gated `/pharn-dev-ship` run. **Advisory.** It records that the chain ran and what the
floor verdicts were — nothing more.

## Stages, in order

| #   | stage                | outcome                                                     |
| --- | -------------------- | ----------------------------------------------------------- |
| 1   | `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** — human approved "as written" |
| 2   | `/pharn-dev-grill`   | `GRILL.md`; advisory, gates nothing; proceeded regardless   |
| 3   | `/pharn-dev-build`   | 3 files written; floor GREEN                                |
| 4   | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md`                  |
| 5   | `/pharn-dev-verify`  | `verify-report.json` + `VERIFY.md`                          |
| 6   | `/pharn-dev-review`  | `REVIEW.md`; **GATE 2** — the run ends here, for the human  |

The run ended at **GATE 2**, not at a RED-verdict STOP.

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit **`0`** (`FLOOR: GREEN — 0 capabilities
checked in .`). The repo's own aggregate `npm run check` was also green (988 tests / 49 files).
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`**
  (`check-regress.mjs verdict` exit 0). Base `b12e6ac164eac942d8492a3bfbb41c927b071583`;
  `regressions[]` and `pre_existing[]` both empty; outside gates `tests` 0→0, `validate` 0→0.
  `check-regress.mjs scope` exit 0, `escaped: []` — no fix #7 breach.
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`check-verify.mjs` exit 0).
  Six gates, all exit 0: `test`, `validate`, `lint`, `format:check`, `lint:md`, `typecheck`.
  `failing_gates[]` empty. `verifiers.registered` = 0 — the advisory block is empty and is not a
  proceed/stop input in any case.

Each proceed decision above was read from that stage's own deterministic verdict. None rested on the
agent's judgment or on any free-text field.

## Pointers (cited, not restated — P4)

- `.dev/features/update-backup-dir-on-failure/REVIEW.md` — 4 lenses; **GREEN, 0 floor-gate findings, 3
  advisory (P1 / P2 / P3, all `minor`)**. It also carries one **proposed** canon lesson with
  provenance, unwritten: promotion is a separate human-gated `/pharn-dev-memory-promote` run.
- `.dev/features/update-backup-dir-on-failure/GRILL.md` — advisory; 6 concerns, 0 blocking. Two `P1`
  eval-coverage findings were folded into the build (the config-write throw site, and the success-path
  stream); one finding was corrected downward mid-run after re-checking it.
- `.dev/features/update-backup-dir-on-failure/REGRESSION.md` — records a **measurement fault caught and
  corrected during the run**: the first capture read `tests=1` at both ends because zsh does not
  word-split an unquoted parameter expansion, so `node --test` never ran. `check-regress.mjs` cannot
  distinguish "ran and failed" from "never ran" — both are exit 1.

## What this run does and does not say

Two clocks, stated honestly. **Running** these stages in order is orchestration and is **advisory** —
nothing on the floor forced the sequence; the agent invoked each stage. The **verdicts** are floor,
each owned by its own checker (`validate` exit / `check-regress.mjs` / `check-verify.mjs`). This gated
run added **no new floor primitive**: every guarantee in it belongs to a sub-stage.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
