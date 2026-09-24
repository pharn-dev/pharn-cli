# GRILL — reinit-preserve-edits

Plan: `.dev/features/reinit-preserve-edits/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P3'
  severity: minor
  file: '.dev/features/reinit-preserve-edits/PLAN.md:32'
  problem: 'Reading the previous config and deciding manual carry-over is a new concern for init.ts; it should stay a small, named helper so the command keeps one axis (orchestration).'
  evidence: 'reads the existing config tolerantly'
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/reinit-preserve-edits/PLAN.md:28'
  problem: "The scan in the prompt and the scan before the copy run at different times; the backup must use its OWN scan (the one immediately before the write), not the prompt's, or an edit made while the prompt was open is lost."
  evidence: 'before `installCapabilities`, `scanDest` over the expected install paths'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/reinit-preserve-edits/PLAN.md:41'
  problem: 'pharn.config.json itself is overwritten by re-init; it is not in the install manifest, so it is not backed up. Say so (the manual entries are carried over instead).'
  evidence: 'copies those files to `.pharn-backup/<ts>/`'
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
