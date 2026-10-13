# SHIP — crlf-tolerant-hashing (`/pharn-dev-ship --loop`, cap 3)

## Stages run, in order

1. `/pharn-dev-plan`: `PLAN.md`. GATE 1 was passed by the human ("approved, recommended answers on all six").
2. `/pharn-dev-grill`: `GRILL.md`, advisory. It raised 6 concerns (0 blocking, 2 important). Both important ones were folded into the build: a static test that pins the single comparison hash, and a real `git -c core.autocrlf=true` checkout test.
3. `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**.
4. `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`, iterated:

| iter | base / HEAD context                 | regression-report `.verdict` | verify-report `.verdict` | `check-ship.mjs` decision |
| ---- | ----------------------------------- | ---------------------------- | ------------------------ | ------------------------- |
| 1    | base `ff9312f`                      | `no-regressions`             | `PASS`                   | `STOP_GREEN`              |
| 1'   | rebased onto `c9900e7` (#275, #276) | `no-regressions`             | `FAIL` (`test`)          | `CONTINUE`                |
| 2    | rebased onto `6dae4fe` (#277, #278) | `no-regressions`             | `FAIL` (`test`)          | `CONTINUE`                |
| 3    | `6dae4fe`, unchanged code           | `no-regressions`             | `PASS`                   | **`STOP_GREEN`**          |

Iteration 1' was the iteration-1 verdicts recomputed after the rebase. The two `FAIL`s were 5000 ms test timeouts in files outside this increment (`lint-gate`, `publish-workflow`, `update`) while the shared machine's load average was about 90–190. No code changed between iterations 2 and 3. See `VERIFY.md`.

## Where the run ended

GATE 2. The final `check-ship.mjs` output was `{"decision":"STOP_GREEN","floor_green":true,"iter":3,"cap":3}`.

- Review: [`REVIEW.md`](REVIEW.md) (0 floor-gate findings, 4 advisory)
- Grill: [`GRILL.md`](GRILL.md) (advisory)

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
