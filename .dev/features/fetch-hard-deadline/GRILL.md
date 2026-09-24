# GRILL — fetch-hard-deadline

Plan: `.dev/features/fetch-hard-deadline/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/fetch-hard-deadline/PLAN.md:44'
  problem: "The real trigger (undici 6 + forced GC on Node 20/22) is not reproduced in-suite; the tests model it as 'the body ignores the abort signal'. That is the right invariant to pin, but the GC reproduction should be re-run out-of-suite on Node 22 as evidence."
  evidence: 'a download whose body stream IGNORES the abort signal (the post-GC undici shape)'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/fetch-hard-deadline/PLAN.md:25'
  problem: "Existing error messages/tests for the 8 s abort (`/abort/i`, 'Could not reach') must keep matching, or users lose the host name in the timeout error."
  evidence: 'the timeout error keeps the existing "Could not reach <url>" shape'
```

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 advisory) — for the human to weigh before /pharn-dev-build.
