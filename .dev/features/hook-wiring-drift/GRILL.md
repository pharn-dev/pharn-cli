# GRILL — hook-wiring-drift

Plan: `.dev/features/hook-wiring-drift/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/hook-wiring-drift/PLAN.md:25'
  problem: 'Upstream 6.12.0 ships an EXEC-form hook (`command` + `args[]`, no shell). A key built from `command` alone would make every exec-form hook with the same binary (`node`) collide; the normalized entry must include `args`.'
  evidence: 'normalizes `hooks.<Event>[].{matcher, hooks[].command}`'
- type: FINDING
  rule_id: 'P7'
  severity: important
  file: '.dev/features/hook-wiring-drift/PLAN.md:31'
  problem: 'Making `status --strict` exit 1 on missing upstream hooks turns currently-green CI gates red for every install predating 6.1.0/6.12.0 until the user edits settings.json by hand — intended by the finding, but a user-visible behavior change that belongs in the docs and CHANGELOG.'
  evidence: '`--strict` exits 1 when upstream hooks are missing'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/hook-wiring-drift/PLAN.md:57'
  problem: 'The equality is purely textual: a user who rewrote the same hook with different quoting is reported as missing. The plan labels this advisory; the note text should say so.'
  evidence: 'a differing command string is reported as missing — advisory to the human'
```

## Summary

Report-only design keeps the settings.json invariant. Key normalization must cover exec-form `args`.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
