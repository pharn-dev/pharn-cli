# GRILL — core-181-lock-first-plan-once

ADVISORY. These findings raise concerns for the human and gate nothing (P0). Spec hash recomputed this run:
`bca940a5…`, equal to the plan's `spec_content_hash` (no drift). Registered grillers: 0
(`count-grillers.mjs`: `{"registered":0}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:27'
  problem: 'init already takes a fingerprint in readPreviousConfig BEFORE its tolerant parse. Taking a second one under the lock would bless a write that landed between the two reads. The check before the first write must compare against chosen.previous.fingerprint, not a fresh one.'
  evidence: '`configFingerprint` is taken right before the config is loaded under the lock'
```

Resolution for the build: `init` carries `previous.fingerprint` in the plan's `apply` half and checks it. The other
four commands take the fingerprint immediately before `loadConfig`.

```yaml
- type: FINDING
  rule_id: P0
  severity: advisory
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:29'
  problem: "update's changedSince pre-pass and applyWrites' own re-read are two instants. An edit landing between them is not written (applyWrites skips it), but the plan's nextRecords still holds the upstream hash for it. Check that nextRecordStore really carries the previous record for such a file, and test it with a unit case, since no command test can hit that window."
  evidence: 'a file caught there is left unwritten and its record is not refreshed (`nextRecordStore` gets it as kept)'
```

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:69'
  problem: "The 'second command during a prompt' test runs the second command in the SAME process. The lock judges liveness by pid, so the same pid reads as live (correct). But the second command's withProjectLock must not remove the pharn/ directory or the first lock on its way out. Assert that the first run's lock file is still there right after the refusal, and that the first run then completes."
  evidence: 'each run a second writer → exit 1 … the first run then completes'
```

```yaml
- type: FINDING
  rule_id: P4
  severity: advisory
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:88'
  problem: "docs/commands/add.md's 'Known limit' says each check runs 'not under a lock held across it', and remove.md and uninstall.md describe a re-check under the lock after the confirm. Each becomes untrue. Grep docs/ for 're-check', 'after the confirm', 'after its prompts' and 'under the lock' before claiming the docs are in sync."
  evidence: '`docs/commands/update.md`, `docs/commands/init.md`, `docs/commands/add.md`, `docs/commands/remove.md`, `docs/commands/uninstall.md` — the new order'
```

```yaml
- type: FINDING
  rule_id: P3
  severity: advisory
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:65'
  problem: 'install-archetype.ts (a step) must not import from overwrite-check.ts (a sibling step) to reach the WriteTargetsPlan type. Keep that type in lib/write-targets.ts, where both import it.'
  evidence: "`confirmWriteTargets(cwd, targets)` takes the plan's `WriteTargetsPlan`"
```

```yaml
- type: FINDING
  rule_id: P1
  severity: advisory
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:93'
  problem: "pharn-ci's TESTS_NOT_EXERCISING_CHANGES warns for a changed src file that no added or modified test imports statically. list.ts and status.ts change only by the loader rename. Make sure a modified test imports them (tests/commands/list.test.ts, tests/commands/status.test.ts), or the rename alone draws the warn."
  evidence: '`src/commands/list.ts`, `src/commands/status.ts` — loader rename only'
```

```yaml
- type: FINDING
  rule_id: P5
  severity: advisory
  file: '.dev/features/core-181-lock-first-plan-once/PLAN.md:30'
  problem: "removalBackupsNow can throw (EACCES on an unreadable file in a dropped dir). It must throw before createBackup and before any delete, so the run ends 'nothing changed', as the plan-time refusal did. Wrap it in the same CapabilityRemovalError wording."
  evidence: 'the backup set is recomputed at delete time over the present removal dirs'
```

## Summary

The design is coherent: one plan per run, and write-time checks instead of re-plans. The main risk is the
fingerprint baseline in `init` (finding 1). It must be the one taken before the tolerant read, or the check
weakens. The rest are coverage, doc-sync and boundary reminders.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 2 important, 5 advisory). They are for the human to weigh
before /pharn-dev-build.
