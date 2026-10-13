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

## GATE 2 decision and the STOP_CAP reasoning

GATE 2 accepted the increment despite `STOP_CAP`. The reasoning, recorded as given: every failing `test` case in all three iterations was a vitest 5000 ms timeout in a subprocess-spawning suite this increment does not touch (`tests/lint-gate.test.ts`, `tests/publish-workflow.test.ts`, `tests/release-notes.test.ts`), on a shared host with a 1-minute load average of 90-230 where every other agent saw the same timeouts; those files pass 34/34 with a longer timeout; and CI is the authoritative test run. After GATE 2 the branch was rebased onto `c8adc6a` and integrated with F-07/F-13 (see `PLAN.md`); the post-rebase suite (`CI=1 npx vitest run --maxWorkers=2 --testTimeout=120000`) and the static gates were re-run and are reported in the PR.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
