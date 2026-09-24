# GRILL — engines-node-floor

Plan: `.dev/features/engines-node-floor/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/engines-node-floor/PLAN.md:47'
  problem: 'The smoke job is not a required status check, so a later dependency bump that raises the real floor again would turn it red without blocking a merge; the unit test is the only floor-grade guard, and it only sees engines fields that dependencies declare.'
  evidence: 'CI smoke job on exactly 20.12.0 (not a required check — advisory signal'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/engines-node-floor/PLAN.md:30'
  problem: 'The unit test should read the INSTALLED dependency manifests (node_modules), which is what npm resolves for a consumer at the pinned lockfile — say so, since a consumer resolving ^ ranges fresh may get a newer dependency with a higher floor.'
  evidence: "every runtime dependency's installed `engines.node` lower bound"
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/engines-node-floor/PLAN.md:31'
  problem: 'Pinning doc text in a unit test couples tests to prose; keep it to the badge and the engines string only.'
  evidence: "and README's badge / docs state the same floor"
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
