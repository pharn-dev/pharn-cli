# SHIP — records-key-segment-rule

A roll-up of one gated `/pharn-dev-ship` run. **Advisory** — it records that the chain ran and what its
floor verdicts were. It is not an approval, not a "shipped", and not a `PHARN ✓ reviewed` seal.

## Stages run, in order

| #   | stage               | outcome                                                    |
| --- | ------------------- | ---------------------------------------------------------- |
| 1   | `/pharn-dev-plan`     | `PLAN.md` written; **GATE 1** — human approved as written   |
| 2   | `/pharn-dev-grill`    | `GRILL.md`; advisory, gates nothing; 6 concerns             |
| 3   | `/pharn-dev-build`    | 4 files written; floor GREEN                                |
| 4   | `/pharn-dev-regress`  | `regression-report.json` + `REGRESSION.md`                  |
| 5   | `/pharn-dev-verify`   | `verify-report.json` + `VERIFY.md`                          |
| 6   | `/pharn-dev-review`   | `REVIEW.md`; **GATE 2** — where this run ends               |

**The run ended at GATE 2**, not at a RED-verdict stop.

## Structural verdicts read, verbatim

| stage               | verdict source                              | value                       |
| ------------------- | ------------------------------------------- | --------------------------- |
| `/pharn-dev-build`    | `node .dev/floor/validate.mjs .` exit code  | **0** (`FLOOR: GREEN`)      |
| `/pharn-dev-regress`  | `regression-report.json` `.verdict`         | **`"no-regressions"`**      |
| `/pharn-dev-verify`   | `verify-report.json` `.verdict`             | **`"PASS"`**                |

`/pharn-dev-build` additionally ran the repo's own floor, `npm run check`, GREEN (998 tests / 49 files).
`/pharn-dev-regress` compared `tests` 0→0 and `validate` 0→0 across 46 outside test files (748
assertions), `regressions: []`, `pre_existing: []`. `/pharn-dev-verify` ran six gates — `test`,
`validate`, `lint`, `format:check`, `lint:md`, `typecheck` — all exit 0, `failing_gates: []`, with 0
verifiers registered (floor gates only).

`/pharn-dev-review` has **no structural verdict** and this run did not invent one. Its prose verdict —
GREEN, 0 floor-gate findings, 4 advisory — is for the human to weigh, not a gate anything computed.

## Pointers (cited, not restated — P4)

- `.dev/features/records-key-segment-rule/REVIEW.md` — the four lenses, the traced never-joined
  invariant, 4 advisory findings, and a proposed canon lesson awaiting `/pharn-dev-memory-promote`.
- `.dev/features/records-key-segment-rule/GRILL.md` — advisory pre-build interrogation, 6 concerns.
- `.dev/features/records-key-segment-rule/REGRESSION.md` — includes the fix #7 scope check's raw
  exit-1 result and why the three flagged paths are other stages' declared writes, plus a recorded
  orchestration error that was caught and corrected.
- `.dev/features/records-key-segment-rule/VERIFY.md` — the gate table and what the gates do NOT cover.

## Two items surfaced for a human (reported, never agent-fixed)

1. **`.pharn/writes-scope.json` is tracked in git** while being the loop's per-stage mutable state, so
   every dogfood `/pharn-dev-ship` run dirties it and every `check-regress.mjs scope` over a full
   working-tree diff flags it as a fix #7 escape. Whether to gitignore it is repo policy.
2. **The `/pharn-dev-review` ↔ `ARCHITECTURE.md §6` name overload** stands as documented in this
   command: §6 names "ship" as the terminal stage with a decision + seal, whereas this orchestrator
   stops for the human instead. `ARCHITECTURE.md` is human-only and was not touched.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.**
