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

## CI follow-up (floor, acted on)

CI's `Test` job (`test:coverage`) failed the repo-wide 97% statement gate at **96.79%**: the new exit
listener only ran in a child process, which coverage does not see, on top of uncovered error branches
left by PHARN-04. Fixed with two in-process listener tests (0 → 130; non-zero untouched) and two
`hook-wiring` error-branch tests → **97.10%** locally (non-root, node 22). The local gate script now runs
`test:coverage`, not `npm test`, so this class of miss is caught before a push.

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
