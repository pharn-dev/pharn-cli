# SHIP — detect-skip-framework-caches

A thin, **advisory** roll-up of one gated `/pharn-dev-ship` run. It records **that the chain ran and its
floor verdicts** — nothing more.

## Stages run, in order

| # | stage | outcome |
| - | ----- | ------- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; halted at **GATE 1** |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 7 findings (0 blocking, 3 important, 4 minor); advisory, gates nothing |
| 3 | `/pharn-dev-build` | 4 files written, commit `10872cc` |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` — 0 floor-gate, 4 advisory findings |

**Where the run ended: GATE 2** — the post-review human decision. No stage returned a non-GREEN
verdict, so no RED-verdict STOP occurred.

## Structural verdicts read, verbatim

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` **exit 0** (`FLOOR: GREEN — 0 capabilities
  checked in .`). The repo's own aggregate floor, `npm run check`, was also exit 0.
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (helper exit 0);
  `regressions: []`, `pre_existing: []`; outside gates `tests 0→0`, `validate 0→0`; base
  `4d24ad4111fb4fe9a4a8f310f459f01a3f036a74`.
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (helper exit 0);
  `failing_gates: []`; gates `test 0`, `validate 0`, `lint 0`, `format:check 0`, `lint:md 0`;
  `verifiers: {registered: 0, findings: []}` (advisory, and not a proceed/stop input).

## Advisory artifacts (cited, not restated — P4)

- `.dev/features/detect-skip-framework-caches/REVIEW.md` — the four lenses, the floor-gate/advisory
  split, and a proposed memory-bank lesson candidate.
- `.dev/features/detect-skip-framework-caches/GRILL.md` — the pre-build interrogation.

`/pharn-dev-review` has **no** structural verdict and this roll-up does not invent one: its findings' severity
is LLM-assigned and advisory (`pharn-contracts/finding-shape.md`). It is presented to the human at
GATE 2, not computed against.

## Deviations from the gated script, disclosed

- **Grill findings changed the plan before build.** `/pharn-dev-ship` step 2 says `/pharn-dev-grill` is advisory and to
  "proceed regardless"; this run instead amended `PLAN.md` first (relabeling a `floor:` guarantee to
  `advisory`, adding a fourth neutrality context, adding case-folding pins, keeping the doc
  enumeration). Justification: `/pharn-dev-plan` requires a guarantee lacking a floor reduction be fixed
  "here, before build". Effect: the plan built was not byte-identical to the plan approved at
  GATE 1. Every amendment stayed inside the four already-approved `## Files`;
  `check-regress.mjs scope` independently returned `escaped: []`.
- **`/pharn-dev-regress` base was passed explicitly** rather than auto-detected. The auto-detect rule would
  have resolved `base = HEAD` because `.pharn/writes-scope.json` — the stage's own scratch — made the
  working tree dirty, producing a vacuously green comparison. Base selection is advisory
  orchestration by this stage's own declaration; the verdict is unaffected.
- **`/pharn-dev-regress`'s first capture was a false RED on both sides** (a zsh word-splitting bug in this
  stage's Bash, not a failing test). Both sides were re-captured correctly. Recorded in
  `REGRESSION.md`; proposed as a memory-bank lesson in `REVIEW.md`.

## Standing

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** No merge, push, or
`PHARN ✓ reviewed` seal has been applied, and `/pharn-dev-ship` does not apply one.
