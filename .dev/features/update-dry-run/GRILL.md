# GRILL — update-dry-run (ADVISORY)

Plan: `.dev/features/update-dry-run/PLAN.md`. Spec-hash check: `bca940a5…3c4e` equals the plan's `spec_content_hash` (match; nothing to surface). Registered grillers (`count-grillers.mjs`): 0, so only the inline axes ran. Everything below is advisory and gates nothing.

## Findings

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/update-dry-run/PLAN.md:30"
  problem: "Moving log.warn(unknownWarning) out of applyUpdate and into the caller changes behaviour when readSkillsVersion throws: today the warning is logged before that throw, after the move it is not."
  evidence: "log.warn(report.unknownWarning) after buildUpdatePlan returns"
- type: FINDING
  rule_id: P5
  severity: important
  file: ".dev/features/update-dry-run/PLAN.md:44"
  problem: "The dry-run spinner/exit discipline is unstated: the real run stops its spinner on every failure path and exits only after the clone cleanup; the plan names the try/finally but not the spinner stop or the MIN_CLI 'Update refused' wording."
  evidence: "It fetches inside its own try/finally (clone cleanup, then exit after, the file's existing discipline)"
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/update-dry-run/PLAN.md:106"
  problem: "The parity test compares a dry run on a tree copy with a real run on the original, but the plan does not say how the clone fixture and the records/config are duplicated, so the copy can drift and make parity vacuous."
  evidence: "run --dry-run on a copy of the tree, then the real update --yes on the original"
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/update-dry-run/PLAN.md:136"
  problem: "The 'writes nothing' floor is a snapshot test over fixtures, so it covers only the scenarios listed; a new write call added to the dry-run branch later is caught only by the spy list, which is hand-maintained."
  evidence: "spies on createBackup, applyWrites, writeRecords, writePharnConfig, withProjectLock, assertConfigUnchanged: zero calls"
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/update-dry-run/PLAN.md:20"
  problem: "buildUpdatePlan stays in lib but the report renderers (tense-parameterized) remain in commands/update.ts; the plan does not say where the shared gate expression (Q6) lives, and it must not be duplicated between the two paths."
  evidence: "one shared expression"
- type: FINDING
  rule_id: P6
  severity: minor
  file: ".dev/features/update-dry-run/PLAN.md:88"
  problem: "Plan edits tests/update.test.ts 'only if needed', but the existing suite mocks capability-index and resolve-capabilities modules; the extraction must keep importing them from the same module specifiers or those mocks silently stop applying."
  evidence: "tests/update.test.ts — unchanged expectations"
```

## Summary

Plan is coherent and the floor reductions are named honestly. Main risks: one small real-run behaviour change (warning order on a throw), unspecified failure-path discipline in the new branch, and test-design details that could make the parity and no-write claims weaker than stated.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 2 important, 4 minor) — for the human to weigh before /pharn-dev-build
