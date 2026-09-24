# GRILL — publish-split-oidc

Plan: `.dev/features/publish-split-oidc/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/publish-split-oidc/PLAN.md:42'
  problem: "The plan's central claim (token only in the publish job) is verified by reading the file, not by a floor script; a later edit that re-adds `id-token: write` at the top level would not be caught. Consider pinning it in the existing check-run-pins.test.mjs live-repo tests."
  evidence: 'Verified by reading the file (advisory — no floor script parses job-level permissions).'
- type: FINDING
  rule_id: 'P2'
  severity: important
  file: '.dev/features/publish-split-oidc/PLAN.md:52'
  problem: 'Tarball integrity across jobs is not verified; at minimum the publish job should publish exactly one `.tgz` whose name matches the verified version, so a build job cannot hand over something else by name.'
  evidence: 'a compromised dev dependency in `build` could still alter the tarball'
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/publish-split-oidc/PLAN.md:27'
  problem: 'Refusing prerelease tags is a behavior change for maintainers; docs must say so.'
  evidence: "tag must match `^v[0-9]+\\.[0-9]+\\.[0-9]+$`"
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
