# GRILL — init-dest-type-preflight

Plan: `.dev/features/init-dest-type-preflight/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/init-dest-type-preflight/PLAN.md:5'
  problem: 'Stop the walk at the FIRST non-directory component of each path: deeper components cannot be lstat-ed (ENOTDIR) and must not throw out of the pre-flight; report that component once even when many paths share it.'
  evidence: '`an existing intermediate component that is not a directory`'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/init-dest-type-preflight/PLAN.md:22'
  problem: '`.claude/settings.json` is never overwritten (existsSync → skip), so it must stay OUT of the type walk — a directory there is not a collision the copy would hit.'
  evidence: '`for every path the install manifest says init writes`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/init-dest-type-preflight/PLAN.md:25'
  problem: 'Assert "zero files written" by snapshotting the project tree before and after, not by checking one path, or a partial write elsewhere passes.'
  evidence: '`ZERO files written`'
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — all folded into the build.
