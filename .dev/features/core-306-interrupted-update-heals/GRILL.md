# GRILL — core-306-interrupted-update-heals (PLAN.md), spec-hash check: MATCH (bca940a5…3c4e)

Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0}`); inline axes only.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/core-306-interrupted-update-heals/PLAN.md:19'
  problem: 'The plan assumes plan.nextRecords[rel] equals the source hash for EVERY planned write, including --force rows; if a forced row did not refresh its record, incoming would announce a wrong hash and the file would stay MODIFIED after an interrupt.'
  evidence: '`plan.nextRecords[rel]` is the source `latestHash` for every planned write (`refreshRecord`)'
```

Resolution for build: derive `incoming` from `plan.writes` + the planner's `latestHashes` semantics; assert in a unit/command test that a `--force` write is announced too (or compute incoming from the same source hash map the planner hashed).

### Determinism / failure order (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/core-306-interrupted-update-heals/PLAN.md:57'
  problem: 'Placing the pre-write store after the dropped-directory deletes means a failure of that store write leaves directories deleted; placing it before the deletes leaves the tree untouched on that failure.'
  evidence: '`update.ts` `applyPlannedUpdate`: just before `applyWrites`'
```

Resolution for build: write the announcing store after the backup and BEFORE the deletes (same effect for the AC; strictly better failure state).

### Testability (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/core-306-interrupted-update-heals/PLAN.md:81'
  problem: 'The AC test injects a thrown rename rather than a real SIGINT; it must be argued that the resulting state equals a signal handled at the first await after applyWrites.'
  evidence: 'the `rename` hook throws on the `pharn.records.json` rename made once CONSTITUTION already holds 2.0.0 bytes'
```

Accepted: `die` runs at the first await after the synchronous copy loop, which is the closing `writeRecords`; a throw at its rename leaves the identical on-disk state (files new, store = announcing store, config old). The real-signal path itself is already pinned by tests/project-lock.test.ts. State it in the test's header comment.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/core-306-interrupted-update-heals/PLAN.md:88'
  problem: 'No test pins that the dry run (which shares the planner) previews an interrupted install as healable rather than MODIFIED.'
  evidence: 'Existing suites (update, update-dry-run, ...) unchanged and green.'
```

Resolution for build: add one `--dry-run` assertion in the new file (cheap, same fixture).

### Trust (P2)

No finding: `incoming` keys are only looked up in the manifest-keyed disk map; a malformed map is ignored as a whole (GATE 1 Q2), which fails closed.

### Scope (P7)

No finding: one additive key, three source files, residuals named; the records→config window is deliberately out (GATE 1 Q3).

## Summary

The design is sound and small. Two things to make concrete in the build: compute `incoming` from a source that
provably equals the copied bytes for every write (including `--force`), and write the announcing store before the
deletes. Argue the thrown-rename simulation in the test header and add a dry-run assertion.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to weigh before /pharn-dev-build.
