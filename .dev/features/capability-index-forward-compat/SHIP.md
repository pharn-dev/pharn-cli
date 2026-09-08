# SHIP — capability-index-forward-compat

An **advisory** roll-up of the gated `/pharn-dev-ship` chain. It records that the chain ran and what
each stage's floor verdict was. It is **not** an approval, not a "shipped", and not a
`PHARN ✓ reviewed` seal.

## Stages, in order

| # | Stage                | Artifact                     | Outcome                       |
| - | -------------------- | ---------------------------- | ----------------------------- |
| 1 | `/pharn-dev-plan`    | `PLAN.md`                    | GATE 1 — see the note below   |
| 2 | `/pharn-dev-grill`   | `GRILL.md`                   | advisory; 1 blocking finding folded into the plan |
| 3 | `/pharn-dev-build`   | the diff                     | FLOOR: `validate.mjs` exit **0** |
| 4 | `/pharn-dev-regress` | `regression-report.json`     | FLOOR: `.verdict = "no-regressions"` |
| 5 | `/pharn-dev-verify`  | `verify-report.json`         | FLOOR: `.verdict = "PASS"`    |
| 6 | `/pharn-dev-review`  | `REVIEW.md`                  | advisory; 2 findings fixed in-increment, 3 accepted |

The run ended at **GATE 2** — the post-review human decision point.

## The structural verdicts read, verbatim

- **`/pharn-dev-build`** — `node .dev/floor/validate.mjs .` → exit `0` (`FLOOR: GREEN — 0 capabilities
  checked in .`).
- **`/pharn-dev-regress`** — `.dev/features/capability-index-forward-compat/regression-report.json`
  `.verdict` = `"no-regressions"`; `.regressions` = `[]`; `.pre_existing` = `[]`. Base
  `64e5d28c959612a2e353658bc3bde225454a7b7c` (the pre-build `main`), gates re-run at that baseline in
  a clean worktree.
- **`/pharn-dev-verify`** — `.dev/features/capability-index-forward-compat/verify-report.json`
  `.verdict` = `"PASS"`; `.failing_gates` = `[]`. Gates: `format:check` 0, `lint` 0, `lint:md` 0,
  `typecheck` 0, `test` 0 (887 passing), `validate` 0, `build` 0 — the six CI gates plus the floor.

Registered grillers: **0**. Registered lenses: **0**. Registered verifiers: **0**. This is the CLI
repo; it ships no capability of any of those roles, so every pluggable slot contributed nothing and
only the inline axes ran (P7 — stated, not papered over).

## Pointers (cited, not restated — P4)

- Intent + file list: `.dev/features/capability-index-forward-compat/PLAN.md`
- Pre-build interrogation (advisory): `.dev/features/capability-index-forward-compat/GRILL.md`
- Post-build review (advisory): `.dev/features/capability-index-forward-compat/REVIEW.md`

## Honest note on GATE 1

The human specified this increment in full in the `/pharn-dev-ship` invocation — task, the four fix
steps, the invariants to preserve, and the acceptance criteria — and the same message pre-authorised
the post-review action ("create pull request … merge pr"). So GATE 1's approval was supplied with the
intent rather than as a separate halt, and GATE 2 was **delegated in advance**. Recorded here because
the alternative — writing "approved at GATE 1" as though a halt occurred — is exactly the
"written in the command mistaken for guaranteed" failure this repo exists to prevent (P0).

## Guarantee audit for this file (P0)

- "the stages ran in order" → **ADVISORY**. Nothing on the floor forces the sequence; the agent
  invoked each stage.
- "the named verdicts are as shown" → **FLOOR**, and each belongs to its own sub-stage checker
  (`validate.mjs`, `check-regress.mjs`, `check-verify.mjs`) — `/pharn-dev-ship` added no new floor
  primitive.
- "`/pharn-dev-review` found nothing blocking" → **ADVISORY**. Its severities are LLM-assigned and
  gate nothing.

Chain ran; the named floor verdicts are as shown — this is **NOT** a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
