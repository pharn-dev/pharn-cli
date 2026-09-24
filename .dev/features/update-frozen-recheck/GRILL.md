# GRILL — update-frozen-recheck

Plan: `.dev/features/update-frozen-recheck/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/update-frozen-recheck/PLAN.md:38'
  problem: 'Say which list the re-check keys are drawn from: it must be the NEXT (merged) capabilities, `configCapabilities` = `merged.capabilities`, so an entry the merge drops (e.g. an auto entry no longer selected once it parses) cannot hold the same-version gate open with nothing behind it.'
  evidence: 'next `frozenCapabilities` = config entries still unparseable ∪ config entries listed in the PREVIOUS `frozenCapabilities`'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/update-frozen-recheck/PLAN.md:47'
  problem: 'The field''s meaning broadens from "kept because it could not be parsed" to "kept, or parsed again but its files not yet brought up to date", and init now writes it too (init-manual-carry). The docs are in Files, but the field''s own comment in `src/types.ts:124-127` is not, and would go stale.'
  evidence: '`docs/reference/pharn-config.md` — the `frozenCapabilities` paragraph, same rule'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/update-frozen-recheck/PLAN.md:42'
  problem: 'Add the negative case the rule implies: a formerly-frozen entry that the merge DROPS on the re-check run leaves the list, even if files under its directory were skipped.'
  evidence: 'a skip under ANOTHER capability does not keep the key'
```

## Summary

The plan targets a reproduced defect with a minimal rule (a formerly-frozen key stays while any of its own
files is skipped), and its prefix test reuses the prefix `recordsUnderCapabilities` already uses. Skips
outside the capability's directory correctly do not keep the key: on a re-check run those files are
already at the recorded version, so the normal same-version behavior applies. The concerns are
precision, not direction: draw the keys from the merged list, keep the field's type comment true, and
pin the merge-drop case.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before
/pharn-dev-build. Finding 2 needs `src/types.ts` (comment only) added to the plan's `## Files`.
