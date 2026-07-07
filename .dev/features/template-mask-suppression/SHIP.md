# SHIP — template-mask-suppression (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up. This is NOT a ship, an approval, or a `PHARN ✓ reviewed` seal.** It records that
the gated chain ran and its floor verdicts. The standing decision is the human's, at GATE 2.

## Stages run, in order — ended at GATE 2 (post-review human decision)

| stage                | outcome                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | PLAN.md written; **GATE 1** — human approved as written (Option A, two-scanner).                    |
| `/pharn-dev-grill`   | GRILL.md — advisory; 3 concerns (0 blocking, 1 important, 2 minor); F1/F2/F3 folded into the build. |
| `/pharn-dev-build`   | 6 files written; floor gate below.                                                                  |
| `/pharn-dev-regress` | regression-report.json below.                                                                       |
| `/pharn-dev-verify`  | verify-report.json below.                                                                           |
| `/pharn-dev-review`  | REVIEW.md — advisory; **GATE 2** (this stop).                                                       |

## Structural (floor) verdicts read — verbatim

- **`/pharn-dev-build` → `validate.mjs .` exit code: `0` (GREEN — 35 capabilities).** → proceed.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`: `"no-regressions"`.** Outside gates
  (`tests`, `validate`, `structural:trust-fence`) all `0 → 0`; base `2e6a30c`. → proceed.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`: `"PASS"`.** Every gate exit 0
  (`test`, `validate`, `lint`, `format:check`, `lint:md`, `structural:trust-fence`); `failing_gates: []`;
  0 verifiers registered (floor gates only). → proceed.

All three floor verdicts are **GREEN**. The gated chain added **no new floor primitive** — each verdict
belongs to its sub-stage checker (`validate` / `check-regress` / `check-verify`).

## Advisory outputs (cited, not restated — P4)

- **`.dev/features/template-mask-suppression/REVIEW.md`** — 4 lenses. **1 floor-gate finding (P0,
  important):** the increment's corrected claim "no free text moves the verdict, INCLUDING template
  literals" is falsified for the **≥3-backtick fence-skip** case (a token wrapped in ≥3 backticks is read
  as code) — a smaller instance of the disease the increment set out to cure. The **core fix is sound**
  (V1/V2 single-backtick laundering closed; all floor verdicts green); the finding is a claim-wording
  overshoot at 4 sites + a missing residual test. See `REVIEW.md` for the finding and the recommended
  4-site narrowing + 2-test reconciliation.
  - **`/pharn-dev-review` has no structural verdict, and `/pharn-dev-ship` invents none (P0, fix #3).** Its
    "BLOCKED" is LLM-severity — **advisory**, presented here, **not** a floor stop. `/pharn-dev-ship` reached
    GATE 2 on the three GREEN floor verdicts above.
- **`.dev/features/template-mask-suppression/GRILL.md`** — advisory; gated nothing.
- **Proposed canon lesson** (in REVIEW.md): the fence-robust-scanner ↔ backtick-masking tension — a
  candidate for `/pharn-dev-memory-promote` (human-gated), **not** written to canon here.

## GATE-2 decision (human): fix-then-present — applied, re-verified

The human chose **fix-then-present**. The REVIEW.md P0 finding was reconciled in the same six authorized
files: the 4 claim sites narrowed to name the **≥3-backtick fence-skip** boundary as a documented bound
(monotone: strictly narrows the laundering surface), and the residual pinned by a test in each scanner.
**Re-verified deterministically:** `npm test` **654 pass / 0 fail** (+2 residual tests), `validate.mjs .`
GREEN, `check-verify` **PASS**, `format:check` / `lint` / `lint:md` clean. See `REVIEW.md` §Resolution.

## The standing decision is the human's

The chain ran, the named floor verdicts are GREEN, and the one review finding is now resolved — **this is
still NOT a self-issued judgment that the increment is good or wise, and NOT a ship/seal.** `/pharn-dev-ship`
does not merge, push, commit, or seal; the merge decision remains the human's.
