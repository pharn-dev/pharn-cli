# SHIP — n-plus-one-lens (gated `/pharn-dev-ship` roll-up)

**Advisory roll-up only.** This records that the build-loop chain ran and its floor verdicts. It is
**not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal. `/pharn-dev-ship` adds no floor primitive —
every verdict below belongs to a sub-stage's own checker.

## Stages run, in order, and where the run ended

`/pharn-dev-plan` → **[GATE 1: human approved]** → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` →
`/pharn-dev-verify` → `/pharn-dev-review` → **[GATE 2: human decides — run ends here]**.

The run ended at **GATE 2** (post-review), not at a RED-verdict STOP. Every stage's structural verdict came
back GREEN/PASS, so the chain proceeded to the end and now hands to the human.

## Structural verdicts read (verbatim — the floor-grade proceed/stop inputs)

| stage                | verdict source                                                    | verdict read           |
| -------------------- | ----------------------------------------------------------------- | ---------------------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code                        | **0** (GREEN, 34 caps) |
| `/pharn-dev-regress` | `.dev/features/n-plus-one-lens/regression-report.json` `.verdict` | **`no-regressions`**   |
| `/pharn-dev-verify`  | `.dev/features/n-plus-one-lens/verify-report.json` `.verdict`     | **`PASS`**             |

Each verdict is that sub-stage's own floor checker (`validate` exit / `check-regress` / `check-verify`,
`ARCHITECTURE.md §2` primitive #3). `/pharn-dev-ship`'s act of reading them and proceeding is advisory
orchestration — the same two-clocks split as the stages themselves.

## Pointers (cited, not restated — P4)

- **`.dev/features/n-plus-one-lens/GRILL.md`** — advisory interrogation (3 concerns: 1 important P0 detector-
  description consistency, acted on in the build; 2 minor). Gated nothing.
- **`.dev/features/n-plus-one-lens/REVIEW.md`** — advisory review verdict: **GREEN**, 0 floor-gate (blocking)
  findings, 1 advisory note (P0 floor-taxonomy), + 1 proposed lesson candidate (a `scan-code-*` fixture must
  keep the detectable pattern out of prose — for a human-gated `/pharn-dev-memory-promote`, never self-promoted).
- **`.dev/features/n-plus-one-lens/REGRESSION.md`** / **`VERIFY.md`** — the human renders of the two machine
  verdicts above.

## What landed (for the human's GATE-2 read)

The `n-plus-one` review lens (34th capability) + a deterministic `scan-code-n-plus-one.mjs` query-in-loop
scanner (24 hermetic tests, ★ injection-immune) + 4 eval cases / 8 expected files. v0.1.0 scope: a query-verb
member call lexically inside a brace-delimited `for`/`while` body or a `.forEach`/`.map` call-argument range
(braced **or** braceless-arrow, folded in at GATE 1 per the human's choice). Honest bounds documented: braceless
**statement** loops, `.filter`/`.reduce`/`for await`/`do..while`, ambiguous verbs (`.find`/`.get`/… excluded to
avoid Array/Set/Map collisions), helper-wrapped/cross-file queries are out of scope (P7 future increments).

## Standing decision — the human's

_Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise;
that is the human's call at the post-review gate (merge / fix / abandon)._ `/pharn-dev-ship` does not merge,
push, commit, or seal.
