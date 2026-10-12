# GRILL — remove-preserve-user-files (ADVISORY)

Plan: `.dev/features/remove-preserve-user-files/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/remove-preserve-user-files/PLAN.md:26"
  problem: "A failed backup can leave a PARTIALLY filled .pharn-backup/<ts>/ behind (createBackup mkdirs then copies file by file); the plan's 'nothing deleted' claim is true but the docs must not say 'writes nothing' on that path."
  evidence: "Errors (EACCES on `readdirSync`/`sha256File`, ENOTDIR) PROPAGATE: the caller turns them into a refusal with nothing deleted"
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/remove-preserve-user-files/PLAN.md:67"
  problem: "The only failure eval at the scan side is chmod-based and skipped as root; the integration failure eval uses a symlinked .pharn-backup. Make sure the RemoveBackupError wrapping (including a non-Error throw, if a branch exists for it) is exercised so coverage thresholds hold and the refusal path is demonstrated, not asserted."
  evidence: "unreadable file (chmod 000, skipped when running as root) → throws"
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/remove-preserve-user-files/PLAN.md:85"
  problem: "LIMITS.md cites src/commands/remove.ts by line number (:12, :72, :117, :212, :307); this edit shifts them. The GATE-2 hand-over text for LIMITS.md should refresh those citations too, since the agent cannot."
  evidence: "NOT claimed: symlinks / FIFOs / sockets inside the dir are not backed up"
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/remove-preserve-user-files/PLAN.md:81"
  problem: "Unbounded backup size: a user who keeps a large tree (e.g. build output) inside a capability dir gets it all copied to .pharn-backup/. Acceptable and conservative, but worth one sentence in remove.md rather than a surprise."
  evidence: "Files `remove` cannot prove are pharn's are backed up before the directory is deleted"
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/remove-preserve-user-files/PLAN.md:29"
  problem: "Reading the store once and passing it to the prune changes pruneCapabilityRecords' signature; confirm the existing prune tests (stale stamp, absent, invalid → byte-identical) still exercise the same null-baseline branch through the new call path."
  evidence: "Read the records baseline ONCE inside the lock (after `assertConfigUnchanged`), pass it to both"
```

## Summary

The plan is small, grounded in the code read this run, and keeps remove zero-network. Concerns: be precise in docs about the partial backup directory a failed backup can leave; make sure the refusal path is demonstrated by a test that runs in CI (not only the root-skipped chmod case); refresh LIMITS.md line citations in the hand-over text; mention backup size; keep the prune's null-baseline tests meaningful after the signature change.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 5 advisory) — for the human to weigh before /pharn-dev-build. This log gates nothing.
