# SHIP — c83-remove-derivation-fallback (C8.3, CORE-157)

Stages that ran, in order:

1. `/pharn-dev-plan` → PLAN.md. **GATE 1:** approved by the orchestrator (Q1–Q4 as designed), with two build requirements: (a) the old-ref refusal is tested; (b) an old flat / pre-7.0 install updates to the latest release.
2. `/pharn-dev-grill` → GRILL.md (advisory; 7 concerns, 0 blocking-severity). Its resolutions are recorded in PLAN.md.
3. `/pharn-dev-build` → floor `npm run check` exit **0**; `validate` exit **0**. See BUILD.md.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`** (base `33ffae19`).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (test, validate, lint, format:check, lint:md, typecheck, build all 0).
6. `/pharn-dev-review` → REVIEW.md (advisory; 0 floor-gate findings, 5 advisory).

Where the run ended: **GATE 2**. The orchestrator's standing rule is: regress clean and verify PASS → commit, push and open the PR, held unmerged until v0.21.0 ships. `THREAT-MODEL.md` is changed by the scratchpad `patch-C83.py`, which the user runs.

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
