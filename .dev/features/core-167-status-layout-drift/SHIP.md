# SHIP — core-167-status-layout-drift

Gated `/pharn-dev-ship` run (no `--loop`) for Linear CORE-167 (C2.5).

## Stages, in order

1. `/pharn-dev-plan` → `PLAN.md`. **GATE 1:** the orchestrator, delegated by the human, approved it as planned, including the open choice to skip the NOT SHIPPED UPSTREAM scan on a mismatch. Added requirement: the docs say explicitly that neither the file drift nor NOT SHIPPED UPSTREAM is checked on a mismatch (done in `docs/commands/status.md` step 7).
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 5 concerns, 0 blocking-severity). Resolved in the build: `--no-drift` cannot see a mismatch (stated in the docs), the `layout.upstream` tell for `drift: null` (JSON table + CHANGELOG), the ahead-of-source clause (docs), and HOOKS still running on a mismatch (text test).
3. `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN`); `CI=1 npm run check` GREEN (3670 passed, 1 skipped).
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`**.
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (`failing_gates: []`; test, validate, lint, format:check, lint:md, typecheck, test:coverage, build).
6. `/pharn-dev-review` → `REVIEW.md` (0 floor-gate findings, 4 advisory). See that file; not restated here.

## Where the run ended

At **GATE 2**. The human delegated the decision to the orchestrator with this rule: regress and verify GREEN with no blocking review finding → ship (commit the code and these artifacts, push, open the PR). Both verdicts above are GREEN and REVIEW.md has no floor-gate finding, so the rule says ship. The merge stays a human decision.

The chain ran, and the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
