# SHIP — null-deref lens (gated `/pharn-dev-ship` roll-up, advisory)

A thin roll-up of the gated build loop for the `null-deref` lens. `/pharn-dev-ship` adds **no floor primitive**:
every verdict below belongs to a sub-stage. This file records **that the chain ran and its floor verdicts** — it is
**not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order — ended at GATE 2 (post-review human decision)

| #   | stage                | structural verdict (read verbatim)                        | source                                     |
| --- | -------------------- | --------------------------------------------------------- | ------------------------------------------ |
| 1   | `/pharn-dev-plan`    | GATE 1 — approved as written (human)                      | `PLAN.md` + approval halt                  |
| 2   | `/pharn-dev-grill`   | advisory — 2 minor concerns, 0 blocking                   | `GRILL.md` (gates nothing)                 |
| 3   | `/pharn-dev-build`   | **FLOOR: `validate.mjs` exit `0` (GREEN, 27 caps)**       | build floor gate                           |
| 4   | `/pharn-dev-regress` | **FLOOR: `.verdict` = `no-regressions`**                  | `regression-report.json` (exit 0)          |
| 5   | `/pharn-dev-verify`  | **FLOOR: `.verdict` = `PASS`**                            | `verify-report.json` (exit 0, 0 verifiers) |
| 6   | `/pharn-dev-review`  | advisory — GREEN, 0 floor-gate findings, 2 advisory notes | `REVIEW.md`                                |

The chain reached the end (no RED-verdict STOP); it ends here at **GATE 2** for the human to decide **merge / fix /
abandon**.

## Standing floor verdicts (the only guarantees in this run)

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit `0`** — structural floor GREEN, 27 capabilities
  (was 26; `null-deref` is #27). No new floor primitive beyond the tested scanner
  `.dev/floor/scan-code-null-deref.mjs` (24 hermetic tests, justified P7).
- **`/pharn-dev-regress` → `regression-report.json` `.verdict` = `no-regressions`** — the 31 outside tests +
  `validate` + `structural:trust-fence` are identical base→head; `regressions: []`, `escaped: []` (no scope
  breach, fix #7 re-confirmed).
- **`/pharn-dev-verify` → `verify-report.json` `.verdict` = `PASS`** — `test` / `validate` / `lint` /
  `format:check` / `lint:md` all exit 0; 0 verifiers registered (floor gates only).

## Pointers (cited, not restated — P4)

- **`.dev/features/null-deref-lens/REVIEW.md`** — the 4 advisory review lenses (L-floor/P0, L-eval/P1, L-trust/P2,
  L-axis/P3), the floor-gate vs advisory split, and a **proposed** memory-bank lesson candidate (the `xargs`
  capture lesson) for a separate human-gated `/pharn-dev-memory-promote`. Read it at the gate.
- **`.dev/features/null-deref-lens/GRILL.md`** — advisory pre-build interrogation (2 minor concerns, both folded
  into the build: `semantic[]` judges on the negative expecteds; first-occurrence / source-set / word-boundary
  scanner tests).
- `PLAN.md` / `REGRESSION.md` / `VERIFY.md` — the per-stage artifacts.

## Honest close (P0)

Chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise;
that is the human's call at the post-review gate.** `/pharn-dev-ship` did not merge, push, commit, or seal.
