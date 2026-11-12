# GRILL — fresh-init-hooks

Plan: `.dev/features/fresh-init-hooks/PLAN.md`. Spec-hash check: recomputed sha256(ARCHITECTURE.md) =
`bca940a5…3c4e`, equal to the plan's `spec_content_hash` (content-hash, floor-grade computation; no drift).
Registered grillers: 0 (`count-grillers.mjs` → `{"registered":0}`); inline axes only.

## Findings (advisory)

### Guarantee audit — P0

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/fresh-init-hooks/PLAN.md:47"
  problem: "`hookEntries` ignores a hook's `type`; an entry with a `command` string and a non-`command` type is listed as a command, and a non-command hook (no `command`) is only counted. The note's wording should not claim 'every hook Claude Code runs' — only the entries this reader recognises plus a count."
  evidence: "every wired command hook is shown → floor for the entries `hookEntries` recognises"
```

### Eval coverage — P1

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/fresh-init-hooks/PLAN.md:41"
  problem: "`skipped` is underspecified: does an event whose value is not an array count as one, does a malformed group count as one or as its members? Pin one definition in the code comment and in a test, otherwise the count is unfalsifiable."
  evidence: "`skipped` counts members without a string `command` and malformed groups/non-array events"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/fresh-init-hooks/PLAN.md:44"
  problem: "Parity of real run vs `--yes` is claimed but only one path is listed in tests; `--yes` reaches runInstallArchetype by the same call, so the commands-integration `runInit --yes` case covers `--yes` and init-archetype covers the interactive path — state that mapping."
  evidence: "real `init` / `--yes` → one HOOKS note with the hooks + review line"
```

### Trust propagation — P2

```yaml
- type: FINDING
  rule_id: "P2"
  severity: minor
  file: ".dev/features/fresh-init-hooks/PLAN.md:56"
  problem: "The real run reads the CLONE's settings.json, not the file just written to the project. Equivalent today (cpSync of that file, existence and symlink checked), but the note says 'Wrote … It wires' — the description is of the source bytes. Acceptable; keep it consistent with the dry run, which can only read the clone."
  evidence: "reading the CLONE (still present there)"
```

### Determinism — P5

No findings: every branch named is a membership/size test.

### Honest scope — P7

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/fresh-init-hooks/PLAN.md:80"
  problem: "The `absent` → `unreadable` mapping is defensive for a state the callers never reach; keep it (never-throws contract) but do not add a dedicated message path beyond the generic reason."
  evidence: "returns `unreadable` with reason \"it does not exist\""
```

## Summary

The plan is narrow and follows existing patterns (one composition, additive JSON key, shared predicate).
The main gap is a precise definition of `skipped`; the rest are wording/coverage clarifications.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 1 important, 4 minor) — for the human to weigh before /pharn-dev-build.
