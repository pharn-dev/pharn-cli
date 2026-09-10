# SHIP — atomic-stale-lock-break

Advisory roll-up of one gated `/pharn-dev-ship` run. It records **that the chain ran and what its
floor verdicts were**. It is not a decision, not an approval, and not a `PHARN ✓ reviewed` seal.

## Stages, in order

| # | stage                | outcome                                                          |
| - | -------------------- | ---------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`    | `PLAN.md` written; **GATE 1** satisfied by the human's up-front pre-approval of exactly this scope (the minimal fix + corpse disposal + the doc-comment task) |
| 2 | `/pharn-dev-grill`   | `GRILL.md` — 8 advisory concerns (0 blocking, 3 important, 5 minor); presented, **gates nothing**, chain continued |
| 3 | `/pharn-dev-build`   | built the plan's 4 files; floor GREEN                             |
| 4 | `/pharn-dev-regress` | `regression-report.json` — no regressions                         |
| 5 | `/pharn-dev-verify`  | `verify-report.json` — PASS                                       |
| 6 | `/pharn-dev-review`  | `REVIEW.md` — GREEN, 0 floor findings, 4 advisory                 |

The run ended at **GATE 2**, not at a RED-verdict STOP.

## Structural verdicts read, verbatim

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit **`0`** (`FLOOR: GREEN — 0 capabilities
  checked in .`)
- `/pharn-dev-regress` → `regression-report.json` `.verdict` = **`"no-regressions"`**
- `/pharn-dev-verify` → `verify-report.json` `.verdict` = **`"PASS"`**

Each was read as the proceed/stop input for its stage. Nothing proceeded on prose or on judgment.

## Pointers (cited, not restated — P4)

- `.dev/features/atomic-stale-lock-break/REVIEW.md` — the four advisory lenses and the proposed
  (unwritten) canon candidate.
- `.dev/features/atomic-stale-lock-break/GRILL.md` — the pre-build interrogation. Its P0 findings
  were acted on in the build (both residuals are now labeled in the source); its P7 finding on the
  corpse sweep is recorded as a decision, not silently absorbed: the sweep stays, because the
  human's brief required that no pile of `.pharn.lock.*` files accumulate, and it is now labeled
  ADVISORY in the source rather than presented as a guarantee.
- `.dev/features/atomic-stale-lock-break/VERIFY.md` — including the one red `npm test` capture that
  could not be explained from retained output, disclosed rather than dropped.

## One in-run correction, recorded

`/pharn-dev-review`'s single **important** finding (P0: the corpse sweep called "the guarantee" in
the source while being best-effort in every direction) was fixed in place — `sweepCorpses`' doc now
opens with an explicit ADVISORY label naming what is structural (the `finally`) versus what is
best-effort (the sweep). `npm run check` re-run GREEN after the edit. This is the one thing in the
run where the review changed the artifact; it gated nothing — the change was made because the
finding was right.

## After the chain — one external finding, refuted in the source

Greptile raised a P2 on the PR: the corpse destination can overwrite an existing entry, because
`renameSync` replaces its destination before either the byte verification or the age-gated sweep
runs. The mechanism is real and was re-probed (node v24.13.1). It was **refuted rather than
fixed**, and the reasoning now lives beside the rename as a fourth named residual: the collision
needs our pid *and* our 32 freshly-drawn bits (~1 in 4.3e9), whereas `sweepCorpses` deletes ANY
corpse-shaped file past `STALE_MS` with probability ~1 — so it is a strict subset of an exposure
the file already accepts, and closing it while the sweep stands would be theatre. The comment also
records the trap: making the destination create-or-fail cannot replace `rename`, because two racers
draw different names and both reservations would succeed. The finding's real contribution — that
this is a **distinct** hole, not covered by the sweep's age gate — is written down. Greptile
accepted and closed the thread ("No further finding from me").

All three floor verdicts were re-measured after that edit and after rebasing onto #168/#170/#171,
and none moved: `validate` exit **0**, `.verdict` **`"no-regressions"`** (base now `860fe0b`),
`.verdict` **`"PASS"`**.

## Standing

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
