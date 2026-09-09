# SHIP — lock-before-fetch

Gated `/pharn-dev-ship` run (no `--loop`). Increment: audit finding **P-9** — acquire the
single-writer project lock before the pharn-oss tarball download.

## Stages, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; halted at **GATE 1** |
| — | **GATE 1 (human)** | **approved as written**, including the `init` decline; answers recorded in `PLAN.md` |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 6 advisory concerns; proceeded (grill gates nothing) |
| 3 | `/pharn-dev-build` | files written, floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` |
| 5 | `/pharn-dev-verify` | `verify-report.json` |
| 6 | `/pharn-dev-review` | `REVIEW.md` — 0 blocking, 4 advisory |
| — | **GATE 2 (human)** | **where this run ends** — merge / fix / abandon is the human's call |

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code **`0`** (`FLOOR: GREEN — 0
  capabilities checked in .`)
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`**
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`**

Each was read as the enum/exit-code value it is. No proceed decision in this run rested on any
free-text field.

## Pointers (cited, not restated — P4)

- `.dev/features/lock-before-fetch/REVIEW.md` — the four advisory lenses, incl. one out-of-scope
  defect recorded rather than fixed
- `.dev/features/lock-before-fetch/GRILL.md` — advisory, pre-build
- `.dev/features/lock-before-fetch/PLAN.md` — the approved intent and the GATE-1 answers

## Standing decision

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment
is good or wise; that is the human's call at the post-review gate. No merge, no push of `main`, no
`PHARN ✓ reviewed` seal was applied by this run.
