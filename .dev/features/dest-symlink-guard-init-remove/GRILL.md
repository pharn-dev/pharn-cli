# GRILL — dest-symlink-guard-init-remove

Plan: `.dev/features/dest-symlink-guard-init-remove/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/dest-symlink-guard-init-remove/PLAN.md:62'
  problem: "The pre-flight walks the FILE list, so a symlinked leaf that is itself a to-be-created directory is covered only through the files beneath it; an empty upstream dir would not be walked. Acceptable because cpSync only creates dirs for files it copies, but the claim should say 'every written file path'."
  evidence: 'for every rel in `collectExpectedInstallPaths(...)` ∪ `{.claude/settings.json}`'
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/dest-symlink-guard-init-remove/PLAN.md:30'
  problem: 'install-capabilities.ts will import install-manifest.ts (the mirror it is mirrored by); no cycle exists today (install-manifest imports constants/layout/symlink-guard/validate only), but the dependency direction should be noted.'
  evidence: '`installCapabilities` pre-flight: for every rel in `collectExpectedInstallPaths(...)`'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/dest-symlink-guard-init-remove/PLAN.md:44'
  problem: "SECURITY.md's path-traversal scope line is not in `## Files`; README + CLAUDE.md cover the user-facing claim, so this is optional."
  evidence: '`README.md` — "Safety model"'
```

## Summary

Closes the two remaining write/delete sites with the existing shared walk; the TOCTOU residual is
named. Concerns are wording/coverage, not design.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
