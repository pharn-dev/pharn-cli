# GRILL — frozen-capability-recheck

Plan: `.dev/features/frozen-capability-recheck/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/frozen-capability-recheck/PLAN.md:30'
  problem: 'Write only the frozen keys that are ALSO config capabilities (KEPT), not every index.unknown entry — an unparseable capability this project never had must not pin every future run to a re-fetch.'
  evidence: '`write the sorted frozen keys of the config''s capabilities`'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/frozen-capability-recheck/PLAN.md:27'
  problem: 'Ingest must drop the WHOLE field on any malformed element (not filter), and reject control characters via the same CAPABILITY_NAME_RE; partial acceptance of a hand edit is harder to reason about.'
  evidence: '`kept only when an array of role:name strings`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/frozen-capability-recheck/PLAN.md:35'
  problem: 'The run-2 eval must assert the fetch actually happens (fetchRepo called), not just the absence of "Already up to date", or it can pass on a different early exit.'
  evidence: '`run 2 at the same version fetches again and re-reports KEPT`'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/frozen-capability-recheck/PLAN.md:27'
  problem: 'A stale field left by `remove` of a frozen capability is self-healing (the next update recomputes from config ∩ unknown and clears it) — acceptable, but worth one sentence in the reference doc.'
  evidence: '`cleared once none are frozen`'
```

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 advisory) — all folded into the build.
