# SHIP — fresh-init-hooks (CORE-172)

Advisory roll-up of one gated `/pharn-dev-ship` run.

## Stages run, in order

1. `/pharn-dev-plan` → `PLAN.md`; GATE 1 approved by the human ("Approve as written").
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 5 concerns, 0 blocking-severity). The important one (define
   `skipped`) was addressed in the build: one count per member `hookEntries` drops.
3. `/pharn-dev-build` → floor verdict: `node .dev/floor/validate.mjs .` exit **0**; `npm run check` green.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`"no-regressions"`** (`tests` red at base and
   head, pre-existing).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`"PASS"`** (`failing_gates: []`).
6. `/pharn-dev-review` → `REVIEW.md` (advisory; see it for findings).

## Where the run ended

GATE 2 — the human decides merge / fix / abandon. Outside the chain and still open at this point:
`THREAT-MODEL.md` (hook-protected; the human runs the patch script), then commit, PR, and the pharn-ci report.

chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise;
that is the human's call at the post-review gate.
