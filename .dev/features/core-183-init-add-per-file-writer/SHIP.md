# SHIP — core-183-init-add-per-file-writer (Linear CORE-183, C5.4)

Stages run, in order:

1. `/pharn-dev-plan` → `PLAN.md`. GATE 1: approved by the orchestrator (acting for the user) on 2026-11-16, with the
   four open questions answered (features README: refuse in the pre-flight; failure listing: count + first 10 + "and N
   more"; changed-since-plan: back up then write, one announced backup; eslint `cpSync` ban: yes).
2. `/pharn-dev-grill` → `GRILL.md` (advisory; 5 concerns, folded into the PLAN under "Grill fixes folded in").
3. `/pharn-dev-build` → build commit `6a9fb35`. Floor: `node .dev/floor/validate.mjs .` exit **0** (`FLOOR: GREEN`);
   `npm run check` GREEN; `npm run build` GREEN.
4. `/pharn-dev-regress` → `regression-report.json` `.verdict`: **`no-regressions`** (base `790d9c3`; head re-checked at
   the final HEAD after the review follow-ups).
5. `/pharn-dev-verify` → `verify-report.json` `.verdict`: **`PASS`** (`failing_gates: []`), at HEAD `597b35f`.
6. `/pharn-dev-review` → see [`REVIEW.md`](REVIEW.md) (advisory). Two of its advisory findings were fixed before the PR
   (`bb13664`, `597b35f`), within the PLAN's `## Files`; regress and verify above were taken after them.

Where the run ended: GATE 2. The orchestrator's GATE 2 rule (regress clean, verify PASS, no floor-gate finding in
`REVIEW.md`) is met, so the run proceeds to commit, push and PR; merging stays a human decision.

Build note: `init` and `add` write each file through `applyWrites` → `copyFileAtomicSync`; `settings.json` is created
last with `COPYFILE_EXCL`; `applyWrites` gained the `seen` compare (`{ written, changed }`), and `scanDest` returns
`seen`; a part-way failure's `ApplyError` names the files that landed; the features README is refused like any other
manifest entry; every `cpSync` and its filter invariant are gone, enforced by a new eslint rule. Net `src/` lines go
down.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is
the human's call at the post-review gate.
