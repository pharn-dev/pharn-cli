# GRILL — core-168-init-add-small-fixes

Plan: `.dev/features/core-168-init-add-small-fixes/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e` = the plan's `spec_content_hash` (no drift). Registered grillers (`count-grillers.mjs`): 0 — inline axes only.

All findings below are ADVISORY (fix #3); free-text fields quote the plan and are DATA (P2).

## Findings

### Determinism / behaviour change (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/core-168-init-add-small-fixes/PLAN.md:22'
  problem: "A DIRECTORY (or a live symlink to one) at pharn.config.json with --yes is today refused by the destination pre-flight's type-collision message after the fetch; the new pre-fetch gate (existsSync) refuses it first with the 'already exists' message. Both exit 1 and write nothing, but the plan should say which message wins and test it."
  evidence: "existsSync(safeJoin(projectRoot, PHARN_CONFIG_FILE)), i.e. conflictingWriteTargets' own predicate"
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/core-168-init-add-small-fixes/PLAN.md:47'
  problem: "The 'nothing on stdout' claim for the new refusal needs an explicit assertion that showBanner and intro were not called — init-yes mocks the banner, so a test that only checks stderr would not catch the refusal landing after the banner."
  evidence: 'nothing on stdout (`intro`/`note` not called)'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/core-168-init-add-small-fixes/PLAN.md:30'
  problem: 'row() is shared by every note (status, update, capability-groups); the plan should run the full suite early to find pinned long-label rows rather than discover them at verify.'
  evidence: 'labels ≤ 24 chars byte-identical; longer ones keep a two-space gap'
```

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/core-168-init-add-small-fixes/PLAN.md:17'
  problem: "A pick that THROWS (e.g. createBackup failing) still aborts the whole loop through the outer catch, so earlier successful picks are not summarised in an outro. Out of the ticket's scope (exit 1 is already right there) — say so rather than imply every failure is counted."
  evidence: 'an `error` pick is pushed there (still `logError`ed per pick as today, loop continues)'
```

### Guarantee audit (P0)

No unreduced guarantee found: the zero-network claim reduces to a synchronous existsSync before the first network call (test-pinned), and "--yes never deletes" reduces to "a removal needs a readable replaced config, which is a conflicting target". The ancestor-`.git` caveat is labelled advisory.

## Summary

The plan is small and each item is a membership/existence test with a test that fails first. The concerns: pin which message a directory-typed `pharn.config.json` gets under `--yes` (now the pre-fetch one), assert the banner/intro are not called on the new refusal, run the full suite early for `row()` fallout, and state that a THROWN pick is outside the counted failures.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 advisory) — for the human to weigh before /pharn-dev-build.
