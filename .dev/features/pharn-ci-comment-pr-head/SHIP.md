# SHIP — pharn-ci-comment-pr-head

Stages run, in order: `/pharn-dev-plan` → GATE 1 (human: "Approve as written"; fork path keeps
`block`) → `/pharn-dev-grill` → `/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` →
`/pharn-dev-review` → GATE 2 (the run ends here).

Structural verdicts, verbatim:

- `/pharn-dev-build`: `node .dev/floor/validate.mjs .` exit `0`; `npm run check` exit `0`
- `/pharn-dev-regress`: `regression-report.json` `.verdict` = `"no-regressions"` (base `f83b736`)
- `/pharn-dev-verify`: `verify-report.json` `.verdict` = `"PASS"`, `failing_gates: []`

Advisory: [GRILL.md](GRILL.md) (4 concerns; the two important ones folded into the build: the
`with:`-map pin plus `fetch-depth`, and the Dependabot residual named in the workflow comment) and
[REVIEW.md](REVIEW.md) (GREEN, 3 minor advisory findings). After review, its first two findings were
fixed (comment wording at `ci.yml`; the write-grant scan now sees a grant with a trailing comment),
and `npm run check` (exit 0) and `validate` (exit 0) were re-run.

The PR is opened because the task asked for one. Merging is the maintainer's decision, after reading
the PR's own pharn-ci report and comment.

Chain ran; the named floor verdicts are as shown. This is NOT a judgment that the increment is good
or wise; that is the human's call at the post-review gate.
