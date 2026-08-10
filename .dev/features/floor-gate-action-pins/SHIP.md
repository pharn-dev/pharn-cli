# SHIP — floor-gate-action-pins

Gated `/pharn-dev-ship` run (no `--loop`). Base `112e22616993bf219fc251a4f0c5d008ea017cb2`. This is the **second** increment of the session; it stacks on the uncommitted `pin-floor-actions` diff and the two are intended to land together (`.dev/features/pin-floor-actions/SHIP.md`).

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; halted at **GATE 1** |
| — | **human** | approved **"Approve as written"** |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 4 concerns, advisory; F1/F2 folded into the build |
| 3 | `/pharn-dev-build` | 2 files written; floor RED once (a fail-open), fixed, then GREEN |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md`; **run ends here at GATE 2** |

**Where the run ended: GATE 2.** Not a RED-verdict STOP.

## Structural verdicts read, verbatim

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit code: `0`** (`FLOOR: GREEN`). `npm run check` exit `0`.
  - Recorded honestly: the floor was **RED at first** — the `unpinnable-ref` test (added because of `GRILL.md` F2) failed, exposing a fail-open in the checker's own ref-capture regex. Per `/pharn-dev-build` Step 3 the build HALTed, the parser was fixed, and the floor was re-run to GREEN. The verdict above is the post-fix read.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict`: `"no-regressions"`** (exit `0`; `regressions[]` empty; `tests` 0→0, `validate` 0→0).
- **`/pharn-dev-verify` → `verify-report.json` `.verdict`: `"PASS"`** (exit `0`; `failing_gates[]` empty; `verifiers.registered: 0`).

## Feature evidence beyond the verdicts (because the verdicts do not cover it)

`npm test` is vitest and does not collect `.mjs`, so the increment's 18 tests are outside the `test` gate. Three separate proofs are recorded in `VERIFY.md`: its own suite 18/18; **collection under floor.yml's exact command asserted by name** (`684 = 666 + 18`, exit 0); and a **true-negative** on a scratch copy of the real workflows — reintroducing `actions/setup-node@v7` yields exit 1 with `{"file":".github/workflows/floor.yml","line":22,"ref":"actions/setup-node@v7","reason":"floating-ref"}`.

## Pointers (cited, not restated — P4)

- `.dev/features/floor-gate-action-pins/REVIEW.md` — GREEN, 0 floor-gate findings, 4 advisory. Two **lesson candidates** proposed, neither written to canon.
- `.dev/features/floor-gate-action-pins/GRILL.md` — F1 replaced a bare `exit 0` assertion with content assertions; F2 produced the test that caught the fail-open.
- `.dev/features/floor-gate-action-pins/{REGRESSION,VERIFY}.md`.

## Scope

`/pharn-dev-ship`'s only Write-tool output is this file, scoped to itself immediately before writing (fix #7). The build's scope was floor-pinned to the plan's two `## Files` paths; `check-regress.mjs scope` confirmed `escaped: []`.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.**

Nothing has been committed, pushed, merged, or sealed.
