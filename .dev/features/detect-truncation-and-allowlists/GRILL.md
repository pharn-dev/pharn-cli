# GRILL — detect-truncation-and-allowlists

Plan: `.dev/features/detect-truncation-and-allowlists/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` —
matches the plan's `spec_content_hash` (content-hash, floor-grade computation; surfaced only).
Registered grillers (`.dev/floor/count-grillers.mjs .`): `{"registered":0}` — inline axes only.

## Findings

### P5 — determinism / correctness of the truncation flag

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/detect-truncation-and-allowlists/PLAN.md:36'
  problem: 'Today the budget check sits at the TOP of the per-entry loop, before the skip filters (symlink, SKIP_DIRS, ecosystem trees, .env, non-regular files); if `truncated` is set there, a directory whose only remaining entries are skipped ones would report truncation for entries that would never have been classified.'
  evidence: 'returns `truncated: true` iff it skipped an entry it would have classified because the entry budget was spent'
```

The build should move the budget/depth checks to just before `budget -= 1` (after every filter), so
the flag means exactly what the plan states.

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/detect-truncation-and-allowlists/PLAN.md:52'
  problem: 'The warning text hard-codes 50,000 and 24; if WALK_LIMITS changes the prose would silently lie.'
  evidence: 'detection stopped early (it examines at most 50,000 entries, 24 directories deep)'
```

Derive the numbers from `WALK_LIMITS` in the renderer (one source).

### P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/detect-truncation-and-allowlists/PLAN.md:41'
  problem: "The plan's guarantee 'a settled result is final' needs a test comparing a short-circuited walk with a FULL walk of the same tree (archetypes + evidence equal), not only a test that the walk stops."
  evidence: "pinned by tests that compare a settled short-circuited walk to a full walk's archetypes + evidence"
```

The audit names it; the Evals list does not. Add it (a full walk is obtainable by calling
`scanFileTree` without `packageSignals` and merging by hand, or with a tree that settles only at
its last entry).

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/detect-truncation-and-allowlists/PLAN.md:58'
  problem: 'No eval pins that `detectionTruncated` is absent when false in an END-TO-END `init --dry-run --json` run (the unit test of buildInitReport does not prove init.ts threads the flag).'
  evidence: '`init --dry-run --json` gains the additive top-level `detectionTruncated: true`'
```

### P4 — docs

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/detect-truncation-and-allowlists/PLAN.md:205'
  problem: 'The approval adds a docs sentence (runtime DB driver ⇒ backend) and a `--archetype backend` pointer for the dev-only case; the Files list should name where each lands so neither is forgotten.'
  evidence: 'the docs add ONE sentence that a runtime DB driver dependency means `backend`'
```

### P7 — scope

No finding. Both fixes are triggered by named findings (F-25, F-27); the allowlist additions were
approved explicitly; peer/optional are documented-not-read rather than built.

### P2 — trust

No finding. The only new data is a CLI-computed boolean and allowlist literals.

## Summary

The plan is coherent and small. The main concern is the exact placement of the cap checks relative
to the skip filters (otherwise the new flag can over-report), plus two missing evals: settled ≡ full
walk, and an end-to-end JSON check of the new key. Hard-coded numbers in the warning should come
from `WALK_LIMITS`.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to
weigh before /pharn-dev-build. This grill-log gates nothing.
