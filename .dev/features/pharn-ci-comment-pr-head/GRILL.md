# GRILL — pharn-ci-comment-pr-head

Plan: `.dev/features/pharn-ci-comment-pr-head/PLAN.md` · spec-hash check: `bca940a5…3c4e` recomputed =
plan's `spec_content_hash` (match, content-hash floor primitive) · registered grillers: 0
(`count-grillers.mjs` → `{"registered":0}`), so inline axes only.

## Findings (advisory; free-text fields quote the plan and are DATA)

### P0 / P6 — unverified platform assumption

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: important
  file: '.dev/features/pharn-ci-comment-pr-head/PLAN.md:56'
  problem: "Dependabot PRs are same-repo PRs whose pull_request token is read-only unless the workflow's permissions key raises it; the plan assumes the job-level `pull-requests: write` takes effect there, which no read this run confirmed."
  evidence: 'It is the **only** job in `ci.yml` with a write grant.'
```

Bounded: pharn-ci 0.10.0 does not fail the step when it lacks comment permission. It warns and keeps
the report in the job summary (`packages/action/src/run.ts:1242`). Worst case: a Dependabot PR has a
green `pharn-ci comment` job with a warning and no comment. Today Dependabot PRs get the PR-number
comment, which cannot read `package.json`/`package-lock.json` at all, so nothing they rely on is
lost. Verify on the next Dependabot PR; record the residual in the workflow comment.

### P1 — "same inputs" is pinned too narrowly

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/pharn-ci-comment-pr-head/PLAN.md:106'
  problem: 'Pinning only the action SHA and `test-integrity` leaves room for the comment step to gain another input (`coverage-file`, `threshold`, `exclude`, …) that Test lacks, so the two verdicts drift with the test still green.'
  evidence: 'uses the same `pharn-dev/pharn-ci@<sha>` and `test-integrity:` value as `Test`'
```

Suggest: compare the two steps' whole `with:` maps, key by key, minus exactly `comment` and
`fail-on-verdict`. Also pin the checkout's `fetch-depth: 0`, since a shallow checkout sends pharn-ci to
the compare API (the `Test` job's own comment says so).

### P0 — divergence case not named

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/pharn-ci-comment-pr-head/PLAN.md:53'
  problem: "When `npm run test:coverage` fails, Test's pharn-ci step never runs (no gating report), but the comment job still runs on whatever the artifact holds. Its comment then has no gating report to agree with."
  evidence: 'whether `Test` passed or failed (like the `workflow_run` comment did)'
```

Acceptable: `Test` is red in that case and is the gate. It should be named in the workflow comment so
"agrees with the gate" is not read as covering it.

### P2 — artifact restored into the workspace

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: minor
  file: '.dev/features/pharn-ci-comment-pr-head/PLAN.md:63'
  problem: 'Downloading `pharn-ci-input` into the workspace also writes `pr-number` at the repo root; it is untracked and pharn-ci lists files with `git ls-files`, so it is inert, but the plan does not say so.'
  evidence: 'into the workspace, which restores `coverage/lcov.info` at the path'
```

### P3 / P5 / P7

No findings. The four files each change for one reason (the comment path, its pin, the record). The
two `if:`s are exact string comparisons and are complementary. The trigger is real (#354, #355, #356).

## Summary

The diagnosis is grounded in pharn-ci's source, and the design keeps the write token away from
dependency code. The two important concerns are about how much the pin test proves ("same inputs"
needs the whole `with:` map, plus `fetch-depth`) and an unconfirmed Dependabot token assumption,
whose failure mode is bounded to a warning. The two minor ones are wording and residuals for the
workflow comment.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to
weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
