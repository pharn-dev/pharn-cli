# GRILL — core-158-root-migration-hint

Plan: `.dev/features/core-158-root-migration-hint/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (content-hash,
floor-grade computation; it only warns here, `/pharn-dev-build` enforces). Registered grillers:
`{"registered":0}` (`count-grillers.mjs`), so only the inline axes ran.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/core-158-root-migration-hint/PLAN.md:19"
  problem: "A throwing lstat on the destination is classified `exists`, so the hint would say pharn/memory-bank/ 'already exists' when it may not; the fail-safe direction is right, but the wording would then state a fact pharn did not establish."
  evidence: "a throwing lstat (e.g. ENOTDIR) → `exists` too (the conservative answer: never print a command that nests or fails)"
```

Suggested resolution (advisory): phrase the `exists` hint so it is true in both cases, e.g. "pharn/memory-bank/
already exists (or cannot be checked)", or keep the wording and pin the ENOTDIR case in a unit test so the
behaviour is at least chosen, not accidental.

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/core-158-root-migration-hint/PLAN.md:66"
  problem: "The 'never renamed' guarantee reduces to the absence of a renameSync in root-migration.ts, but other modules (backup.ts, atomic-write.ts) also rename; the grep should be over every src/ path that could reach memory-bank/, or the claim should rest on the integration tests alone."
  evidence: "no code path calls `renameSync` on them after the change (the only `renameSync` in root-migration.ts is deleted"
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/core-158-root-migration-hint/PLAN.md:41"
  problem: "The plan rewrites the 'reopens for user data' case to assert no reopen, but does not say the test also checks that a 7.x install with root memory-bank/ AND a record-equal root doc still reopens (the doc half must survive the deletion of the loop it shared a function with)."
  evidence: "a root `memory-bank/` on a 7.x install does NOT re-open (no codeload fetch, records byte-identical, folder untouched)"
```

The existing `re-opens the same-version return for root docs` integration case and the unit doc-half
cases cover the doc half on their own; adding a combined fixture is optional. Advisory: confirm at build
that those cases stay unmodified.

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/core-158-root-migration-hint/PLAN.md:33"
  problem: "Removing the `move …` keys from membershipKeys is untested in either direction; nothing pins that the membership guard still refuses when a root-doc delete appears between the confirm and the lock."
  evidence: "`membershipKeys` drops the `move …` keys"
```

### Determinism (P5)

No findings. Both branches are lstat presence tests; the terminal fallback (`exists` → no command) is the
conservative one, not a guess.

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/core-158-root-migration-hint/PLAN.md:21"
  problem: "Renaming ROOT_MOVES_FROM_MAJOR is not required by the ticket; it is justified (the name would be false after the change) but enlarges the diff, and CORE-162 runs in parallel on the same files."
  evidence: "Rename `ROOT_MOVES_FROM_MAJOR` → `ROOT_MIGRATION_FROM_MAJOR`"
```

```yaml
- type: FINDING
  rule_id: "P6"
  severity: important
  file: ".dev/features/core-158-root-migration-hint/PLAN.md:12"
  problem: "An install already at SKILLS 7.x with a root memory-bank/ will no longer see ANY hint until the next pharn-oss version bump (the same-version return no longer reopens, and status does not print the note). The plan accepts this per the ticket's AC but the docs should say when the hint appears."
  evidence: "A root `memory-bank/` alone no longer re-opens the same-version early return"
```

Suggested resolution (advisory): in `docs/commands/update.md`, say the hint is printed by a run that plans
(a version change, `--force`, or any other reopen), not by "Already up to date".

### Trust (P2), one axis (P3)

No findings. The hint prints fixed literals only. All edits stay within the root-migration axis plus the
plumbing that carried move backups.

## Summary

The plan is a removal with one small addition (the hint). The concerns are about wording honesty (the
`exists` fallback, when the hint is visible), one over-narrow guarantee reduction (the renameSync grep),
and test pins worth adding cheaply (ENOTDIR fallback, membership guard). None needs a re-plan; all fit
inside the declared files.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 4 important, 3 minor) — for the human to weigh
before /pharn-dev-build. This is not a judgment that the plan is sound.
