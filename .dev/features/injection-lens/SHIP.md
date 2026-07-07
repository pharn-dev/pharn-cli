# SHIP — injection-lens (gated /pharn-dev-ship roll-up — advisory)

A thin, **advisory** roll-up of the gated `/pharn-dev-ship` chain for the `injection` lens increment. This records
**that the chain ran and its floor verdicts** — it is **not** a self-issued "shipped", an approval, or a
`PHARN ✓ reviewed` seal. `/pharn-dev-ship` adds **no** new floor primitive (default gated mode); every verdict below
belongs to a **sub-stage**.

## Stages that ran, in order, and where the run ended

`/pharn-dev-plan` → **[GATE 1: human approved]** → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review` → **[GATE 2: ends here]**

The run reached **GATE 2** (post-review). No stage hit a RED-verdict STOP.

## The structural verdicts read (verbatim — the only floor-grade facts here)

| stage                | verdict source                                                   | verdict read                  | proceed?  |
| -------------------- | ---------------------------------------------------------------- | ----------------------------- | --------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code                       | **0** (FLOOR GREEN — 16 caps) | ✔ proceed |
| `/pharn-dev-regress` | `.dev/features/injection-lens/regression-report.json` `.verdict` | **`no-regressions`**          | ✔ proceed |
| `/pharn-dev-verify`  | `.dev/features/injection-lens/verify-report.json` `.verdict`     | **`PASS`**                    | ✔ proceed |

- **GATE 1 (plan acceptance):** the human approved the plan as written and ratified the three-class sink set (`sql|command|html`). `/pharn-dev-ship` neither added nor bypassed this gate.
- **`/pharn-dev-grill`** (advisory, gates nothing): 4 concerns raised (1 important, 3 minor) — build-time construction obligations, all honored in the build. See `GRILL.md`.
- **`/pharn-dev-review`** (advisory; no structural verdict — `/pharn-dev-ship` computes none from it): **GREEN, 0 floor-gate findings, 2 advisory (minor).** See `.dev/features/injection-lens/REVIEW.md` (cited, not restated — P4).

## What landed (12 files)

- Product lens `pharn-review/injection/injection.md` (`role: lens`, `enforces: [P2]`), 3 eval cases + 6 expected.
- Floor scanner `.dev/floor/scan-code-injection.mjs` + 20 hermetic tests (incl. the ★ injection-immunity pair and every true-negative). New floor primitive, justified (P7) as the deterministic backstop for the lens's floor claim.
- Live capability count **15 → 16**; whole suite **260/260**; floor GREEN.

## Guarantee audit (P0) — what this roll-up is and is NOT

- **Chain ran in order** → ADVISORY (the agent invoked each stage; nothing on the floor forces the sequence).
- **Proceed-past-a-stage** → each read a **FLOOR** verdict (its own checker: `validate` exit / `check-regress` / `check-verify`); the _act_ of reading + proceeding is ADVISORY orchestration (the two clocks).
- **`/pharn-dev-ship` wrote only `SHIP.md`** → FLOOR (fix #7 writes-scope hook).
- Net: **zero** new floor primitive; `/pharn-dev-ship` = convenience + two preserved human gates.

## Standing decision — the human's (GATE 2)

Chain ran; the named floor verdicts are as shown (`build` validate exit **0**, `regress` **no-regressions**, `verify` **PASS**) — this is **NOT** a judgment that the increment is good or wise; that is the human's call at the post-review gate. `/pharn-dev-ship` does **not** merge, push, commit, or seal.
