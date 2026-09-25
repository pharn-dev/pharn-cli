# GRILL — local-file-reads

Plan: `.dev/features/local-file-reads/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction.

## Findings

### Determinism (P5)

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/local-file-reads/PLAN.md:56'
  problem: 'The lock case says only "does not hang". The lock already has a rule for an unreadable file: presumed live while younger than MALFORMED_GRACE_MS (10 s), then broken (project-lock.ts isStale). State that a FIFO follows it — a young one refused as a live lock, an old one broken and replaced — and test both, or the test proves only the absence of a hang.'
  evidence: 'A FIFO at `.pharn.lock` does not hang acquisition'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/local-file-reads/PLAN.md:37'
  problem: 'The reasons are named but not fixed. They reach messages (the records `invalid` note, the fingerprint) and the fingerprint is compared across two reads, so fix the vocabulary: "is not a regular file", "is larger than 16 MiB", and the errno code for any other open failure.'
  evidence: 'the bytes, absent, or unusable with a named reason'
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/local-file-reads/PLAN.md:50'
  problem: 'Only the reader''s own FIFO case is placed in a child process. The records, config and lock FIFO cases need the same: on the base they block in open(2) and would hang the vitest worker rather than fail (tests/hook-wiring.test.ts records the same lesson).'
  evidence: 'a FIFO (in'
```

### Checked, no finding

- **Scope.** Every plain read of the three files is declared (`readRecords`, `readPharnConfig`,
  `configFingerprint`, `recordedSkillsVersion`, `readCarriedEntries`, `readRawAt`). The other
  `readFileSync` sites read the clone (`skills-version.ts`: the extractor writes only regular files
  and directories) or project files already type-checked first (`hash.ts` through `scanDest` /
  `readDiskState`).
- **Trust (P2).** No new output beyond fixed reason strings; the bytes stay data.
- **Guarantee audit (P0).** Both claims reduce to `O_NONBLOCK` + `fstat` + a size compare in one
  function, with tests.

## Summary

Small, well-scoped plan. Pin the lock case to its existing grace rule, fix the reason strings, and
run every FIFO case in a child process.

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 0 important, 3 minor) — for the human to
weigh before /pharn-dev-build.**
