# SHIP — dead-code-shared-helpers (`/pharn-dev-ship --loop`, cap 3)

## Stages run, in order

1. `/pharn-dev-plan` → `PLAN.md`; **GATE 1** approved by the human (keep `modules: []`, keep the
   `.env*` skip, accept the `list --json` control-char stripping; keep each symlink-walk caller's
   catch breadth; rebase on origin/main first).
2. `/pharn-dev-grill` — **not run** in this ship run (advisory stage; it gates nothing). See
   `REVIEW.md`'s P0 note.
3. `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit **0**; `CI=1 npm run check` GREEN.
   `BUILD.md`.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`**.
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`**.
6. `/pharn-dev-review` → `REVIEW.md` (no blocking findings; three minor advisory notes).

## Loop

| iteration | regress          | verify | check-ship   |
| --------- | ---------------- | ------ | ------------ |
| 1         | `no-regressions` | `PASS` | `STOP_GREEN` |

Ended: `STOP_GREEN` (`check-ship.mjs` exit 0) after 1 iteration — "floor-GREEN: /verify PASS and
/regress no-regressions — stop and present at the human gate".

Pointers: `REVIEW.md` (advisory findings), `REGRESSION.md`, `VERIFY.md`.

The chain ran and the named floor verdicts are as shown. This is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.
