# GRILL — core-159-held-unit-pending

Plan: `.dev/features/core-159-held-unit-pending/PLAN.md` (approved at GATE 1). Spec-hash check: `ARCHITECTURE.md` sha256 = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` — no drift. Registered grillers: 0 (`count-grillers.mjs`), so the inline axes only.

## Findings

### Determinism / correctness (P5)

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: '.dev/features/core-159-held-unit-pending/PLAN.md:31'
  problem: 'The plan gives two wordings for `missing` ("missing" with a store, "not on disk" without one), but UnitHold carries no bit saying which case applies; the renderer cannot choose without a new field or a second parameter.'
  evidence: 'with NO usable store, every held `restored` rel (pharn cannot tell deleted from new then; the wording says "not on disk")'
```

Resolution taken into the build (no new field): ONE wording true in both cases — "Of those, these are not on disk, so they stay missing until the hold ends:". With a store they are installed files that are gone; without one they may also be new upstream files, and "not on disk" is still exact. The no-store test asserts that wording.

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: '.dev/features/core-159-held-unit-pending/PLAN.md:30'
  problem: "The pending condition relies on a blocker's label appearing in `plan.skipped`; if a future change ever removed blocker groups from `skipped`, a hold with an unverifiable blocker would record pending. The test for the unverifiable/unreadable hold pins this; the comment should say why it holds."
  evidence: "that blocker's own label is in `skipped`, so an `unverifiable`/`unreadable` blocker fails the test"
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/core-159-held-unit-pending/PLAN.md:41'
  problem: "The integration case asserts `add` exits 0 at the pending version but does not say it asserts the stamp (`skillsVersion` 1.0.0 and `commit` SHA_V1 in config AND records) — the AC 'keeps the config's own (skillsVersion, commit) stamp'."
  evidence: '`add a11y` → exit 0 (stamp stays 1.0.0/SHA_V1)'
```

Resolution: assert config + records stamp after `add`, and that the final `update` re-stamps both to 2.0.0/SHA_V2.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: '.dev/features/core-159-held-unit-pending/PLAN.md:36'
  problem: 'No test pins that `add` at a pending version reached via a hold leaves the held unit files untouched (it must write capability directories only).'
  evidence: '`add` copies capability directories only (`installCapabilityDirs`)'
```

Resolution: in the integration case, after `add`, the edited command, the absent hook and the v1 floor are unchanged.

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: '.dev/features/core-159-held-unit-pending/PLAN.md:36'
  problem: "The new comments must not claim pending means 'every other file is at the new version' — under a hold the unit files are not. Wording must say 'every file outside the unit and your kept edits'."
  evidence: 'every file outside the unit and the kept edits is at `installedVersion`'
```

### Honest scope (P7)

No findings: the change is the ticket's, plus one doc (`pharn-config.md`) whose sentence becomes false otherwise — approved at GATE 1.

## Summary

The plan is narrow and its one logic change is a label-membership test. The main gap was a wording branch with no data behind it; the build uses one wording instead. Two eval gaps (stamp after `add`, unit untouched by `add`) are folded into the integration case.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to weigh before /pharn-dev-build. This grill-log gates nothing.
