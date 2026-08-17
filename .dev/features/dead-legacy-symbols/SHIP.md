# SHIP — dead-legacy-symbols (roll-up; ADVISORY)

Gated `/pharn-dev-ship` run (no `--loop`). Base `e097adb`. Spec hash
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, matched at plan, grill, and
build.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | **GATE 1** — halted, 3 open questions asked, human approved as written |
| 2 | `/pharn-dev-grill` | advisory; 5 concerns (0 blocking) — proceeded regardless, by design |
| 3 | `/pharn-dev-build` | floor GREEN → proceed |
| 4 | `/pharn-dev-regress` | `no-regressions` → proceed |
| 5 | `/pharn-dev-verify` | `PASS` → proceed |
| 6 | `/pharn-dev-review` | GREEN, 0 floor-gate findings — **run ends at GATE 2** |

**Where the run ended: GATE 2.** No RED-verdict STOP occurred.

## The structural verdicts read, verbatim

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **`0`** |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`"no-regressions"`** (`regressions: []`, `pre_existing: ["tests"]`) |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`"PASS"`** (`failing_gates: []`) |

Each is a deterministic floor output — an exit code and two enum strings. No proceed decision in
this run rested on any free-text field.

## Pointers (cited, not restated — P4)

- `.dev/features/dead-legacy-symbols/PLAN.md` — the approved intent + the re-run usage map
- `.dev/features/dead-legacy-symbols/GRILL.md` — advisory, 5 concerns
- `.dev/features/dead-legacy-symbols/REGRESSION.md` / `regression-report.json`
- `.dev/features/dead-legacy-symbols/VERIFY.md` / `verify-report.json`
- **`.dev/features/dead-legacy-symbols/REVIEW.md`** — read this at the gate

## Two things this roll-up will not bury

1. **The `/pharn-dev-verify` `test` gate was captured RED once, then green three times**, and the
   recorded `0` reflects a re-measurement the agent judged valid. That judgment is **advisory** and
   no floor primitive backs it; the raw first capture is preserved at
   `.pharn/pharn-dev-verify/results-capture1.json`. Treating the red as authoritative flips the
   verdict to FAIL. Detail in `VERIFY.md`.
2. **`LIMITS.md:30` still names the deleted `INSTALL_PATH_RE` as a floor backstop.** The file is
   human-only (hook-denied), so no stage in this chain could fix it and **no gate will ever fail
   because of it**. Detail + suggested wording in `REVIEW.md` and `PLAN.md`.

---

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate. Nothing was committed, merged,
pushed, or sealed.
