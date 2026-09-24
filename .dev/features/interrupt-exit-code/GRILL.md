# GRILL — interrupt-exit-code

Plan: `.dev/features/interrupt-exit-code/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/interrupt-exit-code/PLAN.md:23'
  problem: "The listener's premise — no legitimate exit(0) happens while a lock is held — is true of today's call sites but not enforced; a future prompt inside a lock would have its graceful cancel reported as 130. Name the premise in the code comment so the next edit sees it."
  evidence: 'Inside every lock callback there is no prompt that can legitimately `exit(0)`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/interrupt-exit-code/PLAN.md:35'
  problem: 'A child-process test needs tsx to import TS; keep it bounded (one spawn) so it stays cheap in CI.'
  evidence: 'a child process that calls `process.exit(0)` while holding the lock exits 130'
```

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 advisory) — for the human to weigh before /pharn-dev-build.
