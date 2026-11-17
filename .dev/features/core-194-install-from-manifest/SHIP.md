# SHIP — core-194-install-from-manifest (Linear CORE-194, C8.2, epic CORE-157)

Stages run, in order:

1. `/pharn-dev-plan` → `PLAN.md`. GATE 1: approved by the orchestrator (acting for the user) on 2026-11-16 with four
   answers (unknown `applies` → `unknown`, `surface` a token; ONE CLI-owned outer bound `isPharnOwnedPath` shared with
   the record-key bound; model rules not consumed; one parser, verify before any branch point), folded into the PLAN.
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 4 concerns, 2 folded into the build: the manifest answers only a `pharn`
   layout request; the uninstall test pins the empty-dir prune).
3. `/pharn-dev-build` → floor `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN`); `npm run check` GREEN after
   one typecheck fix in a new test; `CI=1` full run with coverage GREEN (103 files, 3650 tests; 98.31/95.63/99.23/98.87).
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`** (base `b66d1aa2`, base gate exit
   codes from that commit's green CI run; head gates run locally; scope check: nothing outside the declared files).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (`failing_gates: []`).
6. `/pharn-dev-review` → see [`REVIEW.md`](REVIEW.md) (advisory; 2 concerns accepted with named residuals).

Where the run ended: GATE 2. The orchestrator's rule (regress clean, verify PASS) is met, so the run proceeds to
commit, push and PR; merging stays a human decision. Pending: `THREAT-MODEL.md` (human-owned) is updated by the
owner's `patch-CORE-194.py`, committed separately once applied.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is
the human's call at the post-review gate.
