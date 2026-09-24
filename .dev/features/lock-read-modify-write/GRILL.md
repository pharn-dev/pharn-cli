# GRILL — lock-read-modify-write

Plan: `.dev/features/lock-read-modify-write/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/lock-read-modify-write/PLAN.md:67'
  problem: 'The stress test can show the race is absent in N rounds but cannot prove it; the floor claim must rest on the mtime-grace unit test, with the stress test labeled advisory evidence (the plan does so).'
  evidence: '"zero overlapping holders" → demonstrated by the stress test (advisory evidence, not a proof).'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/lock-read-modify-write/PLAN.md:33'
  problem: 'Comparing JSON.stringify of two parsed configs is exact only because both sides go through the same readPharnConfig; a snapshot mutated in memory before the re-check would false-positive. The check must run before any in-memory mutation of `config`.'
  evidence: '`JSON.stringify` of two `readPharnConfig` results over the same schema'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/lock-read-modify-write/PLAN.md:41'
  problem: 'A multi-process stress test inside vitest adds wall-clock time and potential CI flakiness; keep rounds bounded and assert only overlap = 0.'
  evidence: 'a multi-process stress test (N child processes × rounds'
```

## Summary

Both halves reduce to deterministic compares under the existing O_EXCL lock. The residuals (a >10 s
stalled `tryCreate`, non-pharn writers) are named in the plan.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
