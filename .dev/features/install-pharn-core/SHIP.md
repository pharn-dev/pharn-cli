# SHIP — install-pharn-core

A roll-up of the `/pharn-dev-ship` run. **Advisory**: it records that the chain ran and what each
stage's floor verdict was. It is not an approval, not a "shipped", and not a `PHARN ✓ reviewed` seal.

## Stages run, in order

| # | stage                  | outcome                                                          |
| - | ---------------------- | ---------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`      | `PLAN.md` written; halted at **GATE 1** → human: _Approve as written_ |
| 2 | `/pharn-dev-grill`     | `GRILL.md` — 6 concerns (1 blocking-severity); advisory, gated nothing |
| 3 | `/pharn-dev-build`     | 10 files written; floor GREEN                                    |
| 4 | `/pharn-dev-regress`   | `regression-report.json` — `no-regressions`                      |
| 5 | `/pharn-dev-verify`    | `verify-report.json` — `PASS`                                    |
| 6 | `/pharn-dev-review`    | `REVIEW.md` — 1 blocking finding **against the repo**, not this increment |

**Where the run ended: GATE 2** — the post-review human decision. No stage returned a RED verdict, so
the chain was never STOPped; it reached the gate it is designed to reach.

## Structural verdicts read, verbatim

Each of these — and only these — decided proceed-or-stop. None rests on model judgment.

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code: `0`** (GREEN). `npm run check`
  also exit `0`.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`: `"no-regressions"`**
  (`check-regress.mjs verdict` exit `0`). `regressions: []`, `pre_existing: []`. Base
  `4eed79a11e6c54b435be3b3c4aea54b297f75bec`. The `scope` pre-check exited `0` with `escaped: []` — the
  build did not write outside its plan's `## Files`.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`: `"PASS"`** (`check-verify.mjs` exit `0`).
  `failing_gates: []`; gates `test`/`validate`/`lint`/`format:check`/`lint:md` all `0`. The advisory
  `verifiers` block (`registered: 0`) was **not** an input to that verdict.

## Pointers (cited, not restated — P4)

- `.dev/features/install-pharn-core/REVIEW.md` — the four-lens review, its one blocking finding, and a
  proposed (unwritten) lesson candidate. **Read this before deciding.**
- `.dev/features/install-pharn-core/GRILL.md` — advisory pre-build interrogation.
- `.dev/features/install-pharn-core/REGRESSION.md`, `VERIFY.md` — human renders of the two floor
  verdicts above.

## Deviations from a plain gated run, recorded

- **One extra human gate was taken, deliberately.** After `/pharn-dev-grill` surfaced a
  blocking-severity finding (`update`'s same-version early-return means the new drift cannot be
  repaired without `--force`), the run **halted and asked** rather than proceeding, per **P6**, which
  the constitution places above this command's "proceed regardless" instruction. The human chose
  _document the caveat_ over _widen scope_, and _amend the plan_ to add `tests/diff.test.ts`. `PLAN.md`
  was amended under its own writes-scope before `/pharn-dev-build` ran; GATE 1's approval was not
  re-entered or self-issued.
- **One orchestration error, corrected and recorded.** `/pharn-dev-regress`'s first capture recorded
  `tests: 1` on both sides — a zsh word-splitting artifact, not a red gate. Re-captured; both sides
  genuinely `0`. Detail in `REGRESSION.md`.
- `tests/overwrite-check.test.ts` was declared in `## Files` but needed no change. A declared-but-
  unwritten path is not a scope breach.

## Guarantee audit for this run (P0)

- Running the stages in order, reading their verdicts, and stopping here → **ADVISORY orchestration**.
  Nothing on the floor forced the sequence.
- The three verdicts above → **FLOOR**, each owned by its own sub-stage's checker.
- The two human gates → **ADVISORY** (command discipline); preserved by construction, not by a
  mechanism.
- "`/pharn-dev-ship` may write only `SHIP.md`" → **FLOOR: hook (fix #7)**.
- **Net: this gated run added ZERO new floor primitive.** Every guarantee belongs to a sub-stage.
  `--loop` was not used, so `check-ship.mjs` did not run.

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
