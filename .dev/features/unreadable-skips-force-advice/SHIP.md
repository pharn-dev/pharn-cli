# SHIP — unreadable-skips-force-advice

Gated `/pharn-dev-ship` run (no `--loop`). Increment: stop `pharn update` from prescribing `--force`
for skips `--force` structurally cannot clear.

## Stages that ran, in order

| # | stage                | outcome                                                              |
| - | -------------------- | -------------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** — human approved as written             |
| 2 | `/pharn-dev-grill`   | `GRILL.md` — 5 advisory findings (0 blocking); gates nothing          |
| 3 | `/pharn-dev-build`   | tests first (4 RED → GREEN), then `reportOutcome`; floor GREEN        |
| 4 | `/pharn-dev-regress` | `regression-report.json` — `no-regressions`                           |
| 5 | `/pharn-dev-verify`  | `verify-report.json` — `PASS`                                         |
| 6 | `/pharn-dev-review`  | `REVIEW.md` — 1 blocking P0 finding, fixed and re-gated               |

Ended at: **GATE 2** — the post-review human decision (merge / fix / abandon).

## Structural verdicts read, verbatim

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` **exit 0** (`FLOOR: GREEN — 0 capabilities
  checked in .`), alongside `npm run check` green (951 vitest assertions).
- `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`**
  (`regressions: []`, `pre_existing: []`; base `19eb3457296584913d220b549df70b0c57d558fb`).
- `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`** (`failing_gates: []`; gates
  `test`/`validate`/`lint`/`format:check`/`lint:md` all exit 0; `verifiers.registered: 0`).

Every proceed decision in this run was read from one of those three deterministic verdicts. None
rested on the free-text of `GRILL.md` or `REVIEW.md`.

## Advisory artifacts (cited, not restated — P4)

- `.dev/features/unreadable-skips-force-advice/GRILL.md` — 5 pre-build concerns. Three were folded
  into the build (a positive `FORCEABLE_SKIPS` membership set instead of a single-label negation, a
  fourth mixed-and-forced test, and the byte-identity claim named rather than assumed).
- `.dev/features/unreadable-skips-force-advice/REVIEW.md` — 1 blocking + 2 advisory findings, with the
  applied resolution and the re-gated result recorded in it. It also carries a proposed memory-bank
  lesson, deliberately **not** promoted (a promotion is a separate human-gated
  `/pharn-dev-memory-promote` run).

## Two corrections this run made to its own source prompt

- The truthful doc statement is at `docs/commands/update.md:132-133`, not `:89-91`; it already reads
  true, so no doc change was needed (P4 satisfied by citation, not edit).
- The acceptance criteria were self-contradictory (assert the note contains no `--force`, while the
  prescribed new line contains `--force`). Resolved at GATE 1 by the human: keep `--force cannot
  clear …` and assert the absence of the *prescription*, `Re-run with --force`.

## Two orchestration errors this run caught in itself

- `check-regress.mjs scope` exited 1 on three pipeline-artifact paths that are each floor-scoped by
  their own producing stage; the comparison set was wrong, not the build. Re-run over the build
  stage's writes → exit 0, `escaped: []`. Recorded in `REGRESSION.md`.
- The first `tests` gate capture was vacuous (zsh does not word-split an unquoted expansion, so
  `node --test` got one bogus path and exited 1 at *both* sides — a self-consistent lie that would
  have been reported as `pre_existing`). Both sides re-captured with `xargs`; 748 assertions, exit 0.

---

The chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
