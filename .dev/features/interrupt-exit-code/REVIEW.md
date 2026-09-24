# REVIEW — interrupt-exit-code

Floor first: `node .dev/floor/validate.mjs .` → exit 0 (GREEN). Everything below is **advisory**.

## Floor-gate findings (blocking)

None.

- **L-floor (P0):** an `exit` listener runs on every `process.exit`; while the lock is held it releases
  the lock synchronously and maps exit code 0 → 130. SIGKILL is out of reach (named; the next run
  already breaks a dead-pid lock). The premise (no graceful exit(0) inside a lock) is stated in the code,
  per grill #1.
- **L-eval (P1):** a real child process calling `process.exit(0)` under the lock exits 130, prints the
  interruption line and leaves no `.pharn.lock` (fails on base); the listener is removed after a normal
  release; `update` prints the backup pointer at creation (fails on base) and exactly once on success.
- **L-trust (P2):** no input change.
- **L-axis (P3):** the listener lives with the lock it releases; `update` only moves an existing print.

## Advisory findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: 'src/commands/update.ts'
  problem: "On an aborted --force run the pointer now prints twice: once on stdout at creation and once on stderr with the 'stopped part-way' warning — deliberate (stderr logs must carry it), but visible."
  evidence: 'printBackupNotice(backup, { aborted: false });'
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: 'CHANGELOG.md:8'
  problem: "No CHANGELOG `[Unreleased]` entry (not in the plan's `## Files`)."
  evidence: '## [Unreleased]'
```

## Verdict

**GREEN** — 0 floor-gate findings, 2 advisory findings. No lesson proposed for canon.
