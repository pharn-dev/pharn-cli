# GRILL — capability-index-nonfile-md

Plan: `.dev/features/capability-index-nonfile-md/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/capability-index-nonfile-md/PLAN.md:8'
  problem: 'The capability DIRECTORY `<name>` itself is also joined; confirm the enumeration already requires it to be a real (non-symlink) directory, or the same class of bug exists one level up.'
  evidence: 'replace `existsSync(capFile)` with `lstatSync(capFile, { throwIfNoEntry: false })`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/capability-index-nonfile-md/PLAN.md:34'
  problem: "A FIFO case is named in the plan's rationale but not in its tests; mkfifo is POSIX-only — test it where available or state why not."
  evidence: 'a FIFO would additionally make `readFileSync` block forever'
```

ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 advisory) — for the human to weigh before /pharn-dev-build.
