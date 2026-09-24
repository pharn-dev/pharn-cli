# GRILL — bounded-package-json

Plan: `.dev/features/bounded-package-json/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/bounded-package-json/PLAN.md:6'
  problem: 'Every read failure (open error other than ENOENT, non-regular file, over the cap, read error) must keep today''s shape — `packageJsonFound: false`, never a throw — so init still proceeds on file-tree signals.'
  evidence: '`larger → "not usable", like a parse error`'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/bounded-package-json/PLAN.md:8'
  problem: '`vendor`/`target` could hold hand-authored source in some ecosystems; the SKIP_DIRS comment already records that the failure direction is a LOST signal, never a false one — keep that tradeoff explicit for the new members.'
  evidence: '`SKIP_DIRS gains ... vendor, target`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/bounded-package-json/PLAN.md:30'
  problem: 'The FIFO eval must be skipped on win32 (mkfifo) and must bound its own runtime, so a regression fails the test instead of hanging the suite.'
  evidence: '`FIFO → returns promptly, not found`'
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — all folded into the build.
