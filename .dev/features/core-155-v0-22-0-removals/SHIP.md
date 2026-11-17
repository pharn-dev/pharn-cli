# SHIP — core-155-v0-22-0-removals

Stages run, in order: /pharn-dev-plan (GATE 1, approved as written; target later moved to v0.21.0 by
the owner) → /pharn-dev-grill (`GRILL.md`, advisory) → /pharn-dev-build → /pharn-dev-regress →
/pharn-dev-verify → /pharn-dev-review (`REVIEW.md`). The run ended at GATE 2.

Floor verdicts, verbatim:

- /pharn-dev-build — `node .dev/floor/validate.mjs .` exit **0**
- /pharn-dev-regress — `regression-report.json` `.verdict` **no-regressions**
- /pharn-dev-verify — `verify-report.json` `.verdict` **PASS**

Findings: see `REVIEW.md` and `GRILL.md`.

Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or
wise; that is the human's call at the post-review gate.
