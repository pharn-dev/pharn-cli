# SHIP — deserialization-lens (gated /pharn-dev-ship roll-up, ADVISORY)

`/pharn-dev-ship` ran the gated chain in order and **stopped at GATE 2** (post-review) for the human decision. It added **no** floor primitive of its own — every verdict below belongs to a sub-stage. This roll-up records **that the chain ran and its floor verdicts**; it is **not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order, and where the run ended

| stage                | outcome                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `/pharn-dev-plan`    | PLAN.md written; **GATE 1** (human approved as written — sink set confirmed as the three-kind set) |
| `/pharn-dev-grill`   | GRILL.md — advisory, gates nothing: 3 minor concerns (all absorbed into the build)                 |
| `/pharn-dev-build`   | 12 files written within the plan's `## Files` scope (fix #7); floor run                            |
| `/pharn-dev-regress` | regression-report.json written                                                                     |
| `/pharn-dev-verify`  | verify-report.json written                                                                         |
| `/pharn-dev-review`  | REVIEW.md — **GATE 2**, run ended here                                                             |

## Structural floor verdicts read (verbatim — the only proceed/stop inputs, P5)

- **`/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit `0`** (FLOOR: GREEN — 18 capabilities; the count rose 17 → 18). GREEN → proceed.
- **`/pharn-dev-regress` → `regression-report.json` `.verdict` = `"no-regressions"`** (outside gates `tests` / `validate` / `structural:trust-fence` all `0 → 0`; `regressions: []`, `pre_existing: []`). → proceed.
- **`/pharn-dev-verify` → `verify-report.json` `.verdict` = `"PASS"`** (gates `test` / `validate` / `lint` / `format:check` / `lint:md` all exit `0`; `failing_gates: []`; `verifiers.registered: 0`). → proceed.

No stage returned a non-GREEN verdict, so the run reached GATE 2 rather than a RED-verdict STOP.

## Pointers (cited, not restated — P4)

- **`.dev/features/deserialization-lens/REVIEW.md`** — the 4 advisory lenses (L-floor/P0, L-eval/P1, L-trust/P2, L-axis/P3). Verdict there: **GREEN, 0 floor-gate (blocking) findings**; 3 advisory notes + one proposed (not written) lesson candidate for `/pharn-dev-memory-promote`. Read it for the details — this roll-up does not restate them.
- **`.dev/features/deserialization-lens/GRILL.md`** — advisory pre-build interrogation (gates nothing).
- **`.dev/features/deserialization-lens/VERIFY.md`** — notes a build-completeness fix: the new files first failed `format:check` + `lint:md` and were corrected with the repo's own deterministic auto-formatters (cosmetic, no behavior change) before the gates re-ran GREEN.

## Standing decision — the human's

The chain ran; the named floor verdicts are as shown. **This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or apply the `PHARN ✓ reviewed` seal. Decide **merge / fix / abandon**.
