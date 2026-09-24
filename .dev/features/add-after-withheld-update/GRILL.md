# GRILL — add-after-withheld-update

Plan: `.dev/features/add-after-withheld-update/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/add-after-withheld-update/PLAN.md:12'
  problem: "`add` also merges records stamped with the config pair and refreshes `commit`; at a pending version the clone's commit differs from the recorded one. The plan must confirm that `add` writing the clone's commit does not invalidate the records stamp the withheld update left (stamp = config's old skillsVersion/commit)."
  evidence: "`add`'s version gate accepts a clone at `skillsVersion` OR `pendingSkillsVersion`"
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/add-after-withheld-update/PLAN.md:33'
  problem: "The `unreadable` label is not in FORCEABLE_SKIPS but is a skip label; the set test must use exactly {modified, unrecorded}, not 'forceable'."
  evidence: 'whose skip labels are all in `{modified, unrecorded}`'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/add-after-withheld-update/PLAN.md:31'
  problem: "A new config field must round-trip through every writer that spreads `...config` (add/remove) and be dropped by init's fresh config; confirm no writer re-serializes a stale pending value after a complete update."
  evidence: '`PharnConfig.pendingSkillsVersion?: string` (additive, P7)'
```

## Summary

The key risk is the `commit`/records-stamp interaction in `add` at a pending version — verify in build.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
