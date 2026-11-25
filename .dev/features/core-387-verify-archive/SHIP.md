# SHIP — core-387-verify-archive (Linear CORE-387, epic CORE-380)

Stages, in order: `/pharn-dev-plan` → GATE 1 → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` →
`/pharn-dev-verify` → `/pharn-dev-review` → GATE 2.

- **GATE 1**, plan acceptance: approved by the epic lead as a **model decision made under the user's delegation**,
  not a human approval. The lead added three things, recorded in PLAN.md "GATE 1 amendments":
  - the MIN_CLI validity check and the capability-index build;
  - the tag form in the CI docs;
  - the CI snippet in the PR body.
- `/pharn-dev-grill`: advisory, 6 findings, all folded into the build ([GRILL.md](GRILL.md)).
- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit **0**.
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = **`no-regressions`**. Base `f9fa96b0ac` (origin/main
  after #448), `pre_existing: ["tests"]` ([REGRESSION.md](REGRESSION.md)).
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = **`PASS`**. The gates were test, validate, lint,
  format:check, lint:md, typecheck and build. The live Done-when runs are in [VERIFY.md](VERIFY.md).
- `/pharn-dev-review`: [REVIEW.md](REVIEW.md), advisory, no blocking findings.
- **GATE 2**, the post-review decision: per the lead's standing instruction (a model decision under the user's
  delegation), the PR is opened. It is never merged here; the merge belongs to the lead.

Base history: the branch was cut from `feat/core-386-unpack-listed-paths-only` and merged forward. After #448
merged, origin/main was merged in, never rebased.

Chain ran; the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is
the human's call at the post-review gate.
