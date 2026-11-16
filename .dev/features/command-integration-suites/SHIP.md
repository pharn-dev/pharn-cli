# SHIP — command-integration-suites (CORE-190)

Stages run, in order: `/pharn-dev-plan` (GATE 1 approved by the coordinator: one PR, per-command
commits) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` →
`/pharn-dev-review`. The run ends at GATE 2.

Structural verdicts, verbatim:

- `/pharn-dev-build` → `node .dev/floor/validate.mjs .` exit **0**
- `/pharn-dev-regress` → `regression-report.json` `.verdict` = **"no-regressions"**
- `/pharn-dev-verify` → `verify-report.json` `.verdict` = **"PASS"**

Advisory artifacts: [`GRILL.md`](GRILL.md), [`REVIEW.md`](REVIEW.md).

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
