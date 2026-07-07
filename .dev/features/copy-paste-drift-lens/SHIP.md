# SHIP — copy-paste-drift lens (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up only.** This records that the gated chain ran and its floor verdicts; it is **not** a merge, an
approval, or a `PHARN ✓ reviewed` seal (P0). The run ended at **GATE 2** — the human's merge/fix/abandon decision.

## Stages that ran, in order

`/pharn-dev-plan` → **[GATE 1: human approved]** → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` →
`/pharn-dev-verify` → `/pharn-dev-review` → **[GATE 2: human decides — HERE]**. No stage hit a RED-verdict STOP.

- **GATE 1 note:** the first plan (advisory-only, no scanner) was approved, but the human's paired answer selected
  **"Add a partial-floor scanner"**; the contradiction was surfaced and resolved to the **scanner version (real
  partial floor)**, the plan was rewritten, and re-approved at a second GATE 1. The chain ran on the approved
  scanner-version plan.

## Structural verdicts read, verbatim (the floor clocks — each owned by its sub-stage, not by `/pharn-dev-ship`)

| stage                | verdict source                        | verdict                                                                  |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit | **0 — GREEN, 26 capabilities**                                           |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`   | **`no-regressions`** (exit 0)                                            |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`       | **`PASS`** (exit 0; gates test/validate/lint/format:check/lint:md all 0) |

## Advisory stages (gate nothing — pointers, not restated, P4)

- **`/pharn-dev-grill`** → `.dev/features/copy-paste-drift-lens/GRILL.md` — 6 concerns (1 important, 5 minor),
  spec-hash matched, none blocking. Refinements G2/G3/G4 (multi-line masking, token-kind classification,
  empty/non-parseable fail-safe) were folded into the scanner during build.
- **`/pharn-dev-review`** → `.dev/features/copy-paste-drift-lens/REVIEW.md` — **verdict GREEN**, 0 blocking, 3 minor
  advisory findings (L-floor/P0 prose gloss; L-trust/P2 comment-needle-only eval; L-axis/P3 cross-module precedent
  cite). See that file; not restated here.

## What landed (the increment)

- `.dev/floor/scan-code-copy-paste-drift.mjs` — the new odd-one-out scanner (a **real partial floor**: detects
  ≥3 aligned near-identical lines with a single divergent slot; token-equality primitive #3; injection-immune by
  masking) + `.dev/floor/scan-code-copy-paste-drift.test.mjs` (10 hermetic tests, incl. ★ immunity).
- `pharn-review/copy-paste-drift/copy-paste-drift.md` — the lens (Layer 1 FLOOR scanner + Layer 2 ADVISORY
  bug-or-intentional judgment) + its eval (case-drift-injection + expected×2).

## Standing decision — the human's

The chain ran; the named floor verdicts are as shown (build GREEN, regress `no-regressions`, verify `PASS`,
review GREEN with 3 minor advisories). **This is NOT a judgment that the increment is good or wise; that is the
human's call at the post-review gate** — merge / fix (weigh the 3 advisory findings) / abandon.
