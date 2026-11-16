# GRILL — command-integration-suites (PLAN.md; spec hash bca940a5… matches ARCHITECTURE.md this run)

Registered grillers: 0 (`count-grillers.mjs`), so only the inline axes were run. Advisory throughout.

## Findings

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/command-integration-suites/PLAN.md:94'
  problem: "Deleting ~780 cases risks dropping a security-invariant demonstration (P1) that only a mock suite held, e.g. remove's `../..` name refusal, the symlinked-parent refusals, add's symlinked-dir refusal, init's pre-flight on a dangling link."
  evidence: 'Deleted (cases ported above or covered by existing unit suites)'
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/command-integration-suites/PLAN.md:120'
  problem: 'Per-command commits must each be green, but the 97/92/97/97 floor would fail on the first commit that deletes a mock suite; the floor change must land in the first commit, not last.'
  evidence: 'vitest.config.ts — floors 90/85/90/90'
- type: FINDING
  rule_id: P5
  severity: minor
  file: '.dev/features/command-integration-suites/PLAN.md:30'
  problem: 'The wall-time AC rests on a back-to-back measurement under fluctuating sibling load; one run each may mislead, so take the best of two per side.'
  evidence: 'the AC is checked by running main and this branch back to back'
- type: FINDING
  rule_id: P3
  severity: minor
  file: '.dev/features/command-integration-suites/PLAN.md:47'
  problem: 'harness.ts risks becoming a grab bag (fetch stub + trees + project IO + capture); keep upstream trees/fetch and project helpers separable so suites import only what they use.'
  evidence: '`tests/support/harness.ts` — the extracted harness'
```

## Summary

The plan is sound in shape; the two concerns worth acting on during build are (1) a checklist of the
security-invariant cases in the deleted files, each mapped to a new integration case before the file
is deleted, and (2) commit ordering — floors lowered in commit 1, and each later commit adds a suite
and deletes only the files it replaces, so every commit passes on its own.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 2 important, 2 minor) — for the human to weigh before /pharn-dev-build.
