# GRILL — supervise-stage

Plan: `.dev/features/supervise-stage/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift).
Registered grillers: `{"registered":0,"grillers":[]}` (`.dev/floor/count-grillers.mjs .`), so only
the inline axes ran.

## Findings

### P4 — docs cite code

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/supervise-stage/PLAN.md:80"
  problem: "The planned pharn-config.md sentence says pharn before 0.18.3 'refuses' a block naming supervise; the code does not refuse it — status and update keep the user's block and report it as rejected, and only a pharn-oss block naming it is not applied by init/update. The triage paragraph already words this precisely; extend that wording instead of saying 'refuses'."
  evidence: "and pharn before 0.18.3 refuses a block naming it"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/supervise-stage/PLAN.md:83"
  problem: "The README/getting-started rewrite describes /pharn-supervise's decision; pharn-oss states that decision is advisory (one model overruling or upholding another's escalation, its LIMITS §1d). The docs should not read as if proceed-at-risk makes a finding safe — say the findings are carried as known risk and named in the commit, as upstream does."
  evidence: "on escalation `/pharn-supervise` decides `proceed-at-risk` or `stop` (7.9.0), or since 7.10.0 `amend-spec`"
```

### P6 — discovery completeness

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/supervise-stage/PLAN.md:38"
  problem: "Discovery names the parity test as the vendored checker's user but not tests/init-archetype.test.ts:371, which also spawns it. It needs no edit (its config names no supervise key), and the full suite run covers it."
  evidence: "`diff` of the vendored checker (pinned `aa437fd8…`, pharn-oss `3afbb125`) against `5568d4ce`'s"
```

## Summary

The plan is a near-copy of the triage port, grounded in a live diff, a hash comparison and a smoke
run of the new checker. The code change is one enum member held to pharn-oss by the existing parity
test, so the guarantee audit reduces cleanly (P0). The one substantive concern is wording again: the
reference doc must say what an older CLI does with a `supervise` key (reports it, keeps the user's
block, does not apply such a block from pharn-oss), not that it "refuses" it. The docs describing
the supervisor should keep upstream's own framing of its decision as advisory. No trust,
determinism or scope concerns: the vendored file is test-only, the branch is a membership test, and
the docs edits were asked for.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to
weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
