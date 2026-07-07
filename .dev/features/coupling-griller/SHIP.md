# SHIP — coupling-griller (gated /pharn-dev-ship roll-up)

**Mode:** gated (no `--loop`). **Increment:** the 13th griller — `pharn-pipeline/grillers/coupling/`
(entanglement axis, `enforces: ["P3"]`, advisory-only-beyond-membership). **Spec pin:**
`spec_content_hash = 11cd9ad5…`, re-verified un-drifted at grill and build.

## Stages run, in order — ended at a RED-verdict STOP (verify)

| #   | stage                | nature             | structural verdict read (verbatim)                           | outcome     |
| --- | -------------------- | ------------------ | ------------------------------------------------------------ | ----------- |
| 1   | `/pharn-dev-plan`    | GATE 1 (human)     | plan approved as written (Scope=advisory-only, Principle=P3) | ✅ passed   |
| 2   | `/pharn-dev-grill`   | advisory (no gate) | 2 findings (F1 important, F2 minor) — surfaced, honored      | ▶ proceeded |
| 3   | `/pharn-dev-build`   | FLOOR (validate)   | `validate.mjs` exit **0** → `GREEN — 14 capabilities`        | ▶ proceeded |
| 4   | `/pharn-dev-regress` | FLOOR (.verdict)   | `regression-report.json` `.verdict` = **`no-regressions`**   | ▶ proceeded |
| 5   | `/pharn-dev-verify`  | FLOOR (.verdict)   | `verify-report.json` `.verdict` = **`FAIL`** (`lint:md`)     | ⛔ **STOP** |
| —   | `/pharn-dev-review`  | —                  | **did not run** — chain STOPped at verify                    | not reached |

## Where and why it stopped

`/pharn-dev-verify` returned a **floor FAIL** on the whole-repo `lint:md` gate. Per the gated chain's rule
(branch only on the structural verdict, never agent judgment), the first non-GREEN verdict **STOPs** the
run before `/pharn-dev-review`.

**Attribution (advisory context — see `VERIFY.md`):** the sole failing gate is caused **entirely by
pre-existing, out-of-feature markdown-lint debt** — 4× MD026 in the committed
`.dev/features/comprehension-griller/REVIEW.md`, which this increment never touched. **Every file this
increment produced passes every gate** (`test`/`validate`/`lint`/`format:check` all 0; my own initial
prettier + one MD060 table miss were fixed on my files only). The STOP is faithful to verify's whole-repo
design, **not** evidence of a defect in the coupling griller.

## Artifacts (advisory pointers — read, don't restate; P4)

- `GRILL.md` — 2 advisory findings (F1: the coupled fixture must use genuine shared mutable state, not a
  leaf→leaf import — **honored** in the build; F2: two grillers now enforce P3, partitioned by prose+eval
  discipline).
- `REGRESSION.md` / `regression-report.json` — `no-regressions` (3 outside gates GREEN at base∧HEAD).
- `VERIFY.md` / `verify-report.json` — `FAIL` (`lint:md`), full attribution + the human's options.
- `PLAN.md` — the approved intent + GATE-1 decisions.

## Standing decision is the human's

The chain ran; the named floor verdicts are as shown (build GREEN · regress `no-regressions` · verify
`FAIL` on a pre-existing whole-repo `lint:md` issue). **This is NOT a judgment that the increment is good
or wise; that is the human's call.** `/pharn-dev-ship` does **not** merge, push, or apply any seal.

**Recommended next step (human decides):** resolve the pre-existing `comprehension-griller/REVIEW.md`
MD026 debt (or its `lint:md` scope) in a **separate** increment, then re-run `/pharn-dev-verify` →
`/pharn-dev-review` on this branch. The coupling griller itself is floor-clean and ready.

## Candidate lesson (NOT auto-promoted — gated, P2/P7)

A plan's `## Files` intro note containing an exclusion cue (e.g. "…is NOT touched") truncates
`set-writes-scope --from-plan` to zero paths unless it is a **blockquote** (the parser-exempt form). Fixed
here by blockquoting the two notes. Worth a gated `/pharn-dev-memory-promote` to `lessons-learned` — not
written to canon by this run.
