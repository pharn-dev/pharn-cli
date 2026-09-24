# GRILL — proxy-env-opt-in

Plan: `.dev/features/proxy-env-opt-in/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/proxy-env-opt-in/PLAN.md:10'
  problem: 'NODE_OPTIONS is a free-form string; match the flag as a whole whitespace-separated token (optionally `=…`), not a substring, or `--use-env-proxy-foo` would count.'
  evidence: '`--use-env-proxy` in `process.execArgv` or `NODE_OPTIONS`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/proxy-env-opt-in/PLAN.md:31'
  problem: 'Existing tests that compare the notice with toEqual({ name, value }) will break on the new field; they must be updated deliberately, not loosened.'
  evidence: '`ProxyNotice` gains `envProxy`'
```

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 advisory) — for the human to weigh before /pharn-dev-build.
