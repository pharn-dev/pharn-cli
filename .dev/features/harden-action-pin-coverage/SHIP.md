# SHIP — harden-action-pin-coverage

Third increment of the session. Stacked on `chore/pin-action-digests` (PR #79) — the checker exists only on that branch.

## Stages run

| # | stage | outcome |
| --- | --- | --- |
| 0 | adversarial sweep (`wf_885c411f-670`) | 5 lenses, 29 candidates — see the caveat below |
| 1 | `/pharn-dev-plan` | `PLAN.md`; scope grew from 3 items to the full coverage class |
| 2 | `/pharn-dev-build` | 2 files; floor GREEN |
| 3 | `/pharn-dev-regress` | `"no-regressions"` |
| 4 | `/pharn-dev-verify` | `"PASS"` |
| 5 | `/pharn-dev-review` | `REVIEW.md` — GREEN, 3 advisory |

## Structural verdicts, verbatim

- **`validate.mjs` exit `0`** (`FLOOR: GREEN`); `npm run check` exit `0`; full `floor.yml` `node --test` exit `0`, **696 tests / 0 fail** (684 → +12).
- **`regression-report.json` `.verdict`: `"no-regressions"`** (`check-regress` exit 0; `escaped: []`).
- **`verify-report.json` `.verdict`: `"PASS"`** (`check-verify` exit 0; `failing_gates: []`; `verifiers.registered: 0`).

## Evidence that the holes are actually closed

Each hole was reproduced against the **shipped** gate (PR #79), then re-probed after the fix. All seven now exit 1 with the correct enum reason; each has a regression test encoding the old behaviour. `npm test` is vitest and does not collect `.mjs`, so the 30 tests here are proven by the floor.yml command directly, not by the `test` gate.

## Recorded methodology error (P6)

The sweep's verification phase ran **concurrently with the fix**, so its 5-confirmed/16-refuted split is uninterpretable and is NOT cited as evidence — several refutations describe the already-repaired script. The reliable evidence is the direct before/after probing. Proposed as a lesson candidate in `REVIEW.md`.

## Standing decision

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** Nothing merged or sealed.
