# SHIP — release-tag-ref

`/pharn-dev-ship` (gated mode) for Linear CORE-169, "C3.1 The verified-release tag is resolved as a tag, never a branch". Branch `fix/release-tag-ref`, worktree `.claude/worktrees/release-tag-ref`, base `9542656`.

## Stages, in order

1. `/pharn-dev-plan` → `PLAN.md`. **GATE 1** passed: the human approved it with three answers (also harden the `main` channel, bump to 0.18.5, deliver as a branch and commit).
2. `/pharn-dev-grill` → `GRILL.md`. Advisory, gates nothing: 5 concerns, 0 blocking-severity.
3. `/pharn-dev-build` → commit `55fae47`. `npm run check` (with `CI=1`) passed.
4. `/pharn-dev-regress` → `regression-report.json`, `REGRESSION.md`.
5. `/pharn-dev-verify` → `verify-report.json`, `VERIFY.md`.
6. `/pharn-dev-review` → `REVIEW.md`.

The run ended at **GATE 2**.

## Structural verdicts, verbatim

| stage   | verdict read                               | value            |
| ------- | ------------------------------------------ | ---------------- |
| build   | `node .dev/floor/validate.mjs .` exit code | `0`              |
| regress | `regression-report.json` `.verdict`        | `no-regressions` |
| verify  | `verify-report.json` `.verdict`            | `PASS`           |

## Pointers

- `REVIEW.md`: 0 floor-gate findings, 3 advisory findings.
- `GRILL.md`: advisory.

Manual check recorded for the PR (CORE-169 AC): against real pharn-oss on 2026-11-12, `commits/v7.10.3` and `commits/refs/tags/v7.10.3` both answered `39ec5825b7b811e36993b48957f66a8521749b98`. `commits/tags/v7.10.3` answered 422. `commits/refs/heads/main` and `commits/main` answered the same sha.

Not done by the agent (hook-protected): the LIMITS.md §3e and THREAT-MODEL.md text proposed in `PLAN.md`.

## After GATE 2 — "fix advisories first"

The human chose to fix the advisories before pushing.

- The CHANGELOG wording was corrected ("today's releases" → "the latest release").
- The test-comment note needed no change.
- The protected-docs finding stays with the human.

Re-run on the fixed tree:

- `CI=1 npm run check` → 0
- verify gates → `check-verify.mjs` `PASS` (same report)
- regress head side → `check-regress.mjs` `no-regressions` (same report; the base side is unchanged, same base commit and outside tests)

The committed `regression-report.json` / `verify-report.json` are unchanged.

Chain ran; the named floor verdicts are as shown. This is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.
