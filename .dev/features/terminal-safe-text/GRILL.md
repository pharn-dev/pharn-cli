# GRILL — terminal-safe-text

Plan: `.dev/features/terminal-safe-text/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P2'
  severity: important
  file: '.dev/features/terminal-safe-text/PLAN.md:8'
  problem: 'Keeping `\n` in the sink still lets a hostile name start a new line that LOOKS like a separate pharn message; acceptable (no terminal control), but the extractor refusal must itself render the name with newlines stripped so the refusal line is one line.'
  evidence: '`sanitizes its whole message (keeping \n/\t)`'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/terminal-safe-text/PLAN.md:12'
  problem: 'Check the FULL reconstructed path (prefix + name) before any other rule, so a control byte in the ustar `prefix` field is refused too, and before the typeflag check so an unsupported-type entry is refused by path first when both apply — or render both safely; either way no raw byte.'
  evidence: '`REFUSES a tar entry whose path contains …`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/terminal-safe-text/PLAN.md:31'
  problem: 'The sink test must spy on the real stream write (stderr), not on the argument to logError, or it passes by construction.'
  evidence: '`an ESC sequence in a fatal message never reaches stderr raw`'
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — all folded into the build.
