# REVIEW — update-remove-dropped-capabilities (iteration 1)

Floor first (P0): `node .dev/floor/validate.mjs .` → exit 0, `FLOOR: GREEN — 0 capabilities checked in .` (vacuous for this TypeScript increment). `/pharn-dev-verify` iteration 1: `FAIL`, `failing_gates: ["test"]`. The increment under review is `trust: untrusted`; no instruction-looking content in it changed this review's behaviour.

Reviewed: `git diff ff9312f..HEAD` — `src/lib/capability-dir.ts` (new), `src/commands/remove.ts`, `src/lib/update-plan.ts`, `src/lib/update-report.ts`, `src/commands/update.ts`, comment-only edits in `src/lib/merge-capabilities.ts`, `src/commands/add.ts`, `src/lib/dest-drift.ts`, their tests, and the docs named in the plan.

## Floor-gate findings (blocking)

```yaml
- type: FINDING
  rule_id: P0
  severity: blocking
  file: '.dev/features/update-remove-dropped-capabilities/verify-report.json:1'
  problem: 'The test gate is red: 6 tests time out at the 5 s default (5 in tests/lint-gate.test.ts, which spawns eslint, and 1 in tests/repo.test.ts). Both files are outside the increment, untouched by it, and pass in isolation; the machine load average was 74–98 during the full runs. The verdict stands until a full run is green — re-run at lower load in iteration 2.'
  evidence: 'Error: Test timed out in 5000ms.'
```

- L-floor (P0): containment reduces to `safeChildJoin` (strict child) and `findSymlinkComponent` (refusal before any delete); the backup classification to membership + sha256 equality against the stamp-checked store; the ORDER (backup → delete → write) is labelled control flow, demonstrated by tests. No unlabelled guarantee found.
- L-eval (P1): new behaviour is covered — 5 unit tests (`capability-dir`), 11 planner tests, 11 integration tests in `update.test.ts`, 2 dry-run text tests (snapshot + parity), 3 JSON tests, and the report projection/byte-pin tests.
- L-trust (P2): the removal paths come from the local, ingest-validated config names; the clone only decides membership. See advisory finding 2.
- L-axis (P3): `capability-dir.ts` has one axis (addressing and deleting a capability directory); `remove.ts` and `update-plan.ts`/`update.ts` reach it through `lib/`; no command→command import.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: 'src/commands/update.ts:643'
  problem: "The backup's action (and so the abort line) is derived from whether REMOVAL BACKUPS exist, not from whether any directory is deleted. A run that deletes a directory whose files are all provably pharn's (nothing to back up) but also backs up --force casualties, then fails at a write, says only 'may already have been overwritten' although a directory was also removed."
  evidence: 'action: backupAction(report.backups.length > 0, removalBackups.length > 0)'
- type: FINDING
  rule_id: P2
  severity: important
  file: 'docs/commands/update.md:274'
  problem: 'Grill finding 1 is not yet reflected in the user docs: before this change the untrusted index could only cause a capability not to be installed; now an index that stops listing a capability causes update to delete that directory. Bounded (one validated directory per config entry, unprovable files backed up), but it should be stated where the deletion is documented.'
  evidence: '### Dropped capabilities are deleted'
- type: FINDING
  rule_id: P5
  severity: minor
  file: 'src/lib/update-plan.ts:420'
  problem: 'The reason is narrowed with a type cast after the DROP_REASONS membership test; a type guard would make the narrowing checked rather than asserted.'
  evidence: "reason: change.reason as CapabilityRemoval['reason']"
- type: FINDING
  rule_id: P4
  severity: minor
  file: 'LIMITS.md:71'
  problem: "LIMITS.md still says '`update` never deletes' and cites src/commands/remove.ts and src/commands/update.ts by line numbers this increment shifted; it is human-only, so the replacement text is handed over at GATE 2."
  evidence: 'capability is restored at its new path and the old copy is left on disk — `update` never deletes'
```

## Proposed lesson (not written to canon)

None.

VERDICT: RED for now — 1 floor-gate finding (environmental test timeouts, outside the increment), 4 advisory findings. This review is advisory; the merge / fix / abandon decision is the human's.
