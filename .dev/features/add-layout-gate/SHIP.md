# SHIP — add-layout-gate

Gated `/pharn-dev-ship` run (no `--loop`). Base `a8e9aca`; increment: `pharn add` must refuse a clone
whose layout the config does not record (M1).

## Stages run, in order

| # | Stage                  | Outcome                                                        |
| - | ---------------------- | -------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`      | `PLAN.md` written → **GATE 1**, human approved 2026-08-09        |
| 2 | `/pharn-dev-grill`     | `GRILL.md` — advisory, gates nothing; proceeded regardless       |
| 3 | `/pharn-dev-build`     | 6 files written; floor GREEN                                     |
| 4 | `/pharn-dev-regress`   | `regression-report.json` — `no-regressions`                      |
| 5 | `/pharn-dev-verify`    | `verify-report.json` — `PASS`                                    |
| 6 | `/pharn-dev-review`    | `REVIEW.md` — chain end → **GATE 2**                             |

**Where the run ended: GATE 2** (post-review human decision). No RED-verdict STOP occurred.

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code **`0`**
  (`FLOOR: GREEN — 0 capabilities checked in .`). Also `npm run check` exit 0 — 605 tests.
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`**
  (`check-regress.mjs verdict` exit 0; `regressions: []`, `pre_existing: []`; outside gates
  `tests 0→0`, `validate 0→0` over 666 outside tests).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`**
  (`check-verify.mjs` exit 0; `failing_gates: []`; gates `test`/`validate`/`lint`/`format:check`/`lint:md`
  all `0`; `verifiers.registered: 0`).

Each proceed decision was read from the verdict above it, never from prose and never from my judgment.

## Pointers (cited, not restated — P4)

- `.dev/features/add-layout-gate/REVIEW.md` — 4 lenses; **GREEN, 0 floor-gate findings, 4 advisory**.
  Contains a proposed canon lesson (candidate only) and a follow-up ticket. Read it at the gate.
- `.dev/features/add-layout-gate/GRILL.md` — advisory, pre-build; 5 concerns, 0 blocking-severity.
- `.dev/features/add-layout-gate/PLAN.md` · `REGRESSION.md` · `VERIFY.md` — the per-stage records.

## Two corrections made mid-run (recorded, not papered over)

1. **`/pharn-dev-regress` scope false positive.** The first `check-regress.mjs scope` call exited 1 with
   three blocking P0 fix#7 findings naming `PLAN.md`, `GRILL.md`, and `.pharn/writes-scope.json` as
   build escapes. They are artifacts of **other stages**, each written under its own Step-0 scope
   (`.pharn/**` is always-writable scratch). `--changed` was narrowed to the build-attributable set and
   re-run → `escaped: []`, exit 0. Both invocations are reported in `REGRESSION.md`.
2. **A gate that measured nothing.** `node --test $OUTSIDE` unquoted under **zsh** does not word-split,
   so the outside suite ran as one bogus filename and exited 1 on **both** sides — which would have
   compared cleanly and produced a *true* `no-regressions` verdict over a *vacuous* measurement. Caught,
   both captures re-run through `xargs`, and the numbers above are from those runs.

## Standing decision

The chain ran; the named floor verdicts are as shown. **This is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` has not merged,
pushed, committed, or applied any `PHARN ✓ reviewed` seal, and adds no floor primitive of its own —
every guarantee above belongs to a sub-stage's own checker.
