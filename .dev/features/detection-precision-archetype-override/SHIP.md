# SHIP — detection-precision-archetype-override (`--loop`, cap 3)

Stages run, in order: `/pharn-dev-plan` → GATE 1 (approved with answers, recorded in `PLAN.md`) → `/pharn-dev-grill` (`GRILL.md`, advisory, 7 concerns) → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`, then two loop iterations of regress → verify → review. Mid-run the branch was rebased onto `origin/main` `6dae4fe` (F-05 merged first); regress was re-run against the new base.

| iteration | change                                                 | regress `.verdict` | verify `.verdict` (failing) | check-ship |
| --------- | ------------------------------------------------------ | ------------------ | --------------------------- | ---------- |
| 1         | build (`81baa0b` after rebase)                         | `no-regressions`   | `FAIL` (`test`)             | `CONTINUE` |
| 2         | README evidence example fixed (`2d0e3d2`); test re-run | `no-regressions`   | `FAIL` (`test`)             | `CONTINUE` |
| 3         | test re-run (no code change)                           | `no-regressions`   | `FAIL` (`test`)             | `STOP_CAP` |

`/pharn-dev-build` floor: `node .dev/floor/validate.mjs .` exit 0.

Ended at: `STOP_CAP` — `cap reached: iter 3 >= cap 3 without floor-GREEN — stop and hand to the human` (`.dev/floor/check-ship.mjs` decision verbatim). The failing `test` gate's cases are 5000 ms timeouts in untouched subprocess-spawning suites under host load; see `VERIFY.md`.

Review: `REVIEW.md` (advisory). Grill: `GRILL.md` (advisory).

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
