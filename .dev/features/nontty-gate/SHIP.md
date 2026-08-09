# SHIP — nontty-gate

Gated `/pharn-dev-ship` run (no `--loop`). Base `74a6b40` on `main`, clean tree, PRs #75/#76/#77 markers
verified present. Baseline `npm run check` + `npm run lint:md` GREEN before anything was written.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `.dev/features/nontty-gate/PLAN.md` written → **GATE 1**, human approved as written |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 6 advisory concerns; **gates nothing**; 4 folded into the plan before build |
| 3 | `/pharn-dev-build` | 13 files written inside the declared `## Files`; floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` |
| 5 | `/pharn-dev-verify` | `verify-report.json` |
| 6 | `/pharn-dev-review` | `REVIEW.md` → **GATE 2** (this stop) |

**The run ended at GATE 2** — the chain completed; no stage returned a non-GREEN floor verdict.

## Structural verdicts read, verbatim

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** (`FLOOR: GREEN — 0 capabilities checked in .`) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** (helper exit 0; `regressions: []`, `pre_existing: []`) |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`"PASS"`** (helper exit 0; `failing_gates: []`) |

Each was read as a membership / exit-code test, never from prose. `/pharn-dev-grill` and `/pharn-dev-review`
contributed **no** proceed/stop input — neither has a structural verdict, and `/pharn-dev-ship` does not
invent one for them.

Supporting detail lives in the stage artifacts, cited not restated (P4):
`REGRESSION.md` (scope partition, `escaped: []`, per-gate base→head table, and a recorded measurement
correction), `VERIFY.md` (the five floor gates, coverage deltas, and eight manual e2e transcripts),
`GRILL.md` (6 advisory findings), `REVIEW.md` (4 lenses, 0 floor-gate findings, 3 advisory).

## Deviations from the brief, recorded

1. **Scope widened twice, by declaration + setter re-run — never by bypassing the hook.**
   `tests/remove.test.ts` (the `setTTY` promotion approved at GATE 1 bundled it on one plan line, and
   the setter parses one path per line) and `tests/index.test.ts` (two dispatch assertions break on the
   `yes` wiring — invariant 8's behavior was planned; only its test home was misnamed). Final declared
   scope: 13 files. `check-regress.mjs scope` confirms **`escaped: []`**.
2. **The brief was wrong about one file:** `tests/init-archetype.test.ts` carries **zero** churn — it
   never calls `runInit`. Dropped from the may-edit list at HALT 1.
3. **Two evals added beyond the brief**, both approved at GATE 1: the one-predicate source scan (inv-6)
   and the "confirm is update's only prompt" scan (inv-6b, from `GRILL.md` finding 4).

## Standing advisory items for the human

- **`REVIEW.md` P1 (important):** `pharn init --yes` refuses today only because `runInit()` takes no
  parameters — verified live (exit 1), but **not test-pinned**. ~6 lines to close.
- `REVIEW.md` P0 (minor): `docs/commands/update.md:153` states "and nothing else" unqualified where the
  plan labels it advisory. `REVIEW.md` P3 (minor): `interactiveAllowed` still lives in
  `capability-picker.ts`, now with 4 callers — a future pure move, out of this increment's scope.
- One lesson is **proposed** in `REVIEW.md`, deliberately **not** written to canon; promoting it is a
  separate human-gated `/pharn-dev-memory-promote` run.

---

The chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. Nothing has been committed, merged,
pushed, or sealed.
