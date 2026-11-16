# GRILL — core-183-init-add-per-file-writer

Plan: `.dev/features/core-183-init-add-per-file-writer/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's `spec_content_hash` (content-hash,
surfaced here; `/pharn-dev-build` enforces). Registered grillers: 0 (`count-grillers.mjs`: `{"registered":0}`), so only the
inline axes ran.

## Findings

### P6 — plan state

```yaml
- type: FINDING
  rule_id: 'P6'
  severity: blocking
  file: '.dev/features/core-183-init-add-per-file-writer/PLAN.md:98'
  problem: 'The four open questions were answered at GATE 1 but the plan still lists them under an unresolved HALT heading, which /pharn-dev-build treats as a stop.'
  evidence: '## Open questions (HALT) — each with the recommended answer'
```

### P0 / P1 — the changed-since-plan path

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: important
  file: '.dev/features/core-183-init-add-per-file-writer/PLAN.md:20'
  problem: '`changed` includes a file that VANISHED or became unreadable since the plan; `writeInstallFiles` then hands it to createBackup, which throws on an absent file and refuses a symlinked one, so the backup step would abort the install for a case that needs no backup.'
  evidence: 'if its state differs (hash differs, appeared, vanished, or now unreadable) it is NOT written and lands in `changed`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/core-183-init-add-per-file-writer/PLAN.md:21'
  problem: 'scanDest only hashes a dest when the clone source is a regular file; the plan should say a rel whose dest is a file but whose source is not stays out of `seen` (no compare), and test the absent→null entry.'
  evidence: 'for every rel it inspected, the dest hash it computed (or `null` when the dest was absent)'
```

### P1 — failure-path observability

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/core-183-init-add-per-file-writer/PLAN.md:28'
  problem: "init's copy runs inside a clack spinner; the written-files warning must print after `s.stop(...)` or it is overwritten, and the command-suite test should assert the warning text through the clack stub, not only stderr."
  evidence: 'catch an `ApplyError` around the copy, print one `log.warn` naming the files written before the failure'
```

### P7 — scope

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/core-183-init-add-per-file-writer/PLAN.md:20'
  problem: "`update` passes no `seen` in this PR, so the compare only protects init/add's scan→write window (milliseconds today); acceptable because the ticket requires it for C5.2, but the PR body should say the protection matters once C5.2 moves the prompt between plan and write."
  evidence: 'update passes no `seen` yet, so its behaviour is unchanged; C5.2 wires skip-for-update'
```

## Summary

The plan is a deletion-heavy refactor whose safety rests on existing floor primitives (`safeJoin`, the symlink walk,
atomic replace, `COPYFILE_EXCL`) and on the manifest being the single copy list, which the mirror tests pin. The main gap
is the changed-since-plan path: only files that still exist as regular files with a different hash (or appeared) should
be backed up; vanished/unreadable files should not reach `createBackup` (vanished → just write; unreadable → let the
write's own walk refuse). The HALT heading must be resolved in the plan before build. The spinner ordering and the
`seen` edge cases are small test-plan gaps.

ADVISORY VERDICT: 5 concerns raised (1 blocking-severity — a plan-text fix, 2 important, 2 minor) — for the human to
weigh before /pharn-dev-build. This grill gates nothing.
