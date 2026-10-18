# GRILL — update-confirm-names-membership (F-24)

Plan: `.dev/features/update-confirm-names-membership/PLAN.md`.

- Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, which equals the plan's `spec_content_hash`. No drift.
- Registered grillers: 0 (`count-grillers.mjs` → `{"registered":0}`), so only the inline axes were applied.

## Findings

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/update-confirm-names-membership/PLAN.md:58"
  problem: "The membership guard compares change lists and removal KEYS, but removal keys are derived from the drop changes, so they add nothing. What can actually differ between snapshot and re-plan is `present`. A dropped dir that was absent at the snapshot (shown as 'already gone', confirm default Yes) and is re-created before the lock would be DELETED under a confirm that never named a deletion."
  evidence: "Compare the re-plan's `capabilityChanges` (`reason` + `role:name`, in order) and its removal keys with the snapshot's."
```

Suggested fix: include in the guarded tuple the set of removals that DELETE (`present: true`). Refuse when the re-plan would delete a directory the snapshot did not show as deleted. A snapshot delete that is now "already gone" removes nothing the user did not confirm. Strict equality of that set is simpler, and refusing that rare benign case is acceptable (the human chose "refuse, name what changed").

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/update-confirm-names-membership/PLAN.md:91"
  problem: "The zero-round-trip non-TTY eval must assert `resolveSource` too; the existing test checks only `fetchRemoteSkillsVersion`. `resolveSource('latest')` is the GitHub API call."
  evidence: "a non-TTY refusal still makes ZERO round-trips"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/update-confirm-names-membership/PLAN.md:85"
  problem: "The confirm-default rule (No when deleting) needs a test on BOTH sides, plus `--force` combined with a deletion (message composition)."
  evidence: "The confirm message names the deletion count when the snapshot deletes"
```

### Trust (P2)

No new sink. Names reach the terminal through the existing renderer. No finding.

### Determinism (P5)

The guard is an equality test, and its fallback is a refusal. No finding.

### Scope (P7)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/update-confirm-names-membership/PLAN.md:30"
  problem: "Docs beyond update.md may state the old order: `docs/troubleshooting.md` 'Another pharn process is running', and the `--yes` section of update.md. The build should grep for 'confirm' and 'before the download'."
  evidence: "Docs stating the old order: `docs/commands/update.md` steps 6-7, …"
```

## Summary

The plan is coherent and well bounded.

- The one substantive gap is that the guard does not cover the disk-dependent `present` bit, which is exactly what decides whether a directory is deleted. Add the deleting-removal set to the guard.
- The remaining findings are test and doc coverage.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor). For the human to weigh before /pharn-dev-build. This is not a guarantee that the plan is sound.
