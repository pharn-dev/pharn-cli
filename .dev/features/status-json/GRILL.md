# GRILL — status-json

Plan: `.dev/features/status-json/PLAN.md`. Spec-hash check: matches (`bca940a5…d3c4e`). Registered grillers: 0 (`count-grillers.mjs`), so only the inline axes ran. ADVISORY throughout.

## Findings

### P0 — guarantee audit

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/status-json/PLAN.md:105"
  problem: "'stdout is exactly one JSON object' is labelled 'floor: structural', but it is enforced only by tests and code shape, which is not one of the three floor primitives (hook / content-hash / enum-regex)."
  evidence: "→ floor: structural (single `console.log`/`write` after the report is fully built; every error path precedes it) — enforced by tests asserting captured stdout, not by a hook."
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/status-json/PLAN.md:106"
  problem: "'exit codes identical to text mode' is labelled 'floor: shared predicate', which is likewise not a floor primitive. Label it advisory/test-pinned, and have the build extract ONE strict-failure predicate. The --no-drift path's predicate is only `outdated`, so `strict.failed` must not include drift or hook inputs there."
  evidence: "→ floor: shared predicate. The strict-failure predicate is computed once and reused by both modes (extract or share the existing inline condition)"
```

### P2 — trust

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/status-json/PLAN.md:56"
  problem: "The plain-stderr paths (fatal reporter, proxy notice, json-mode config error) are not stated to pass through terminalSafe. Text mode's logError does. Without it, JSON mode would be the one path where upstream-derived error text reaches a terminal raw."
  evidence: "`console.error` of the `terminalSafe`d message, plus the `PHARN_DEBUG` hint/dump rules ... The proxy notice goes to stderr"
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/status-json/PLAN.md:105"
  problem: "Hook `missing[]`/`localOnly[]` entries have no length cap in JSON, unlike text's 300-char line cap. Input is bounded by the 256KB settings read, but the plan caps reds and unknown fields and silently skips these."
  evidence: "hooks: null | { status, missing: [{event, matcher, command, args}], ..."
```

### P1 — test axes

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/status-json/PLAN.md:91"
  problem: "process.exitCode set inside vitest leaks into the runner's own exit code if a test forgets the reset. A test must also assert text mode still calls process.exit(1) (the two mechanisms now differ), so a refactor cannot move text mode onto exitCode."
  evidence: "`process.exitCode === 1` on exactly the same inputs as text ... reset `process.exitCode` in `afterEach`"
```

### P4 — stale text in the plan

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/status-json/PLAN.md:122"
  problem: "The constraints still say 'see Open questions', but that section was replaced by Resolved decisions. Per decision 6, only the status and init rows of the troubleshooting table change."
  evidence: "the `update` `--ref` omission is flagged instead (see Open questions)"
```

## Summary

The design is sound. The only substantive point is P0 labelling: two 'floor' claims reduce to tests, not to hook/content-hash/enum-regex. The build should relabel them in the docs, and the docs must not call them guarantees. Other items are small: terminalSafe on stderr, a cap on hook entries, and an exit-mechanism regression test.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to weigh before /pharn-dev-build. Nothing here gates the build.
