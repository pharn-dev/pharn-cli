# SHIP — symlink-guard-core

Roll-up of one gated `/pharn-dev-ship` run (default mode, no `--loop`). **Advisory record: this file
states that the chain ran and what its floor verdicts were. It is not an approval, not a "shipped",
and not a `PHARN ✓ reviewed` seal.**

## Stages run, in order

| # | stage                | outcome                                                          |
| - | -------------------- | ---------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** — human approved as written, then amended post-grill (also human-approved) |
| 2 | `/pharn-dev-grill`   | `GRILL.md` — 8 advisory findings (3 blocking-severity); advisory, gated nothing |
| 3 | `/pharn-dev-build`   | 8 files written; floor run                                        |
| 4 | `/pharn-dev-regress` | `regression-report.json` written                                  |
| 5 | `/pharn-dev-verify`  | `verify-report.json` written                                      |
| 6 | `/pharn-dev-review`  | `REVIEW.md` — 0 floor-gate, 5 advisory findings                   |

**Where the run ended: GATE 2** — the post-review human decision. No stage returned a non-GREEN
verdict, so no RED-verdict STOP occurred.

## The structural verdicts read, verbatim

These are the **only** inputs that decided proceed-or-stop. Each is a floor computation belonging to
its own sub-stage; `/pharn-dev-ship` added no new floor primitive.

| stage                | verdict source                                    | value read                        |
| -------------------- | ------------------------------------------------- | --------------------------------- |
| `/pharn-dev-build`   | `node .dev/floor/validate.mjs .` exit code        | **`0`** (`FLOOR: GREEN — 0 capabilities checked in .`) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict`               | **`"no-regressions"`** (`regressions: []`, `pre_existing: ["tests"]`) |
| `/pharn-dev-verify`  | `verify-report.json` `.verdict`                   | **`"PASS"`** (`failing_gates: []`; gates `test`/`validate`/`lint`/`format:check`/`lint:md` all `0`) |

`/pharn-dev-review` has **no structural verdict** and none was invented for it (P0, fix #3): it emits
prose only, and a finding's `severity` is LLM-assigned and therefore advisory. Its floor-grade
content — `validate.mjs` GREEN — was already gated at stages 3 and 5.

## Pointers (cited, not restated — P4)

- `.dev/features/symlink-guard-core/PLAN.md` — the approved intent, spec-pinned at `bca940a5…`
- `.dev/features/symlink-guard-core/GRILL.md` — advisory, gated nothing
- `.dev/features/symlink-guard-core/REGRESSION.md` · `regression-report.json`
- `.dev/features/symlink-guard-core/VERIFY.md` · `verify-report.json`
- `.dev/features/symlink-guard-core/REVIEW.md` — **read this before deciding**; it carries one
  important advisory finding the reviewer would fix before merge, and a proposed canon lesson that a
  separate human-gated `/pharn-dev-memory-promote` run would have to write (never this stage)

## Post-review fix (at GATE 2, human-instructed)

After the chain reached GATE 2, the human directed that `/pharn-dev-review`'s one important advisory
finding be fixed: the `src/lib/validate.ts` `toPosix` comment claimed cross-platform backslash
component-splitting that does not occur on posix. The comment now describes the platform-dependent
behavior accurately. **Comment-only — no executable line changed.**

Because the edit landed *after* stages 4 and 5 ran, their verdicts would otherwise have described
different bytes than the tree now holds. Both were therefore **recomputed against the fixed tree**,
not carried forward:

| stage                | re-read verdict           | exit |
| -------------------- | ------------------------- | ---- |
| `/pharn-dev-verify`  | **`"PASS"`**, `failing_gates: []` | 0 |
| `/pharn-dev-regress` | **`"no-regressions"`**    | 0    |

`npm run check` re-run GREEN (41 files / 754 tests). The verdict table above stands as re-measured.

## Human gates

- **GATE 1 (plan acceptance)** — hit and passed. The human approved the plan, resolved five open
  questions, and separately approved the post-grill amendment that added `tests/validate.test.ts` to
  the whitelist. The model never self-approved.
- **GATE 2 (post-review decision)** — **standing now.** Reaching this point is permission to
  **present**, not to act. Nothing was merged, committed, pushed, or sealed.

## Honest statement

The chain ran and the named floor verdicts are as shown — this is **NOT** a judgment that the
increment is good or wise; that is the human's call at the post-review gate.
