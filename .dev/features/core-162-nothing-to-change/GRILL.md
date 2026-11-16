# GRILL — core-162-nothing-to-change

- plan: `.dev/features/core-162-nothing-to-change/PLAN.md` (approved at gate 1 with one change, recorded in the plan)
- spec-hash check: `sha256(ARCHITECTURE.md)` = `bca940a5…3c4e` = the plan's `spec_content_hash` → **no drift**.
- registered grillers (`count-grillers.mjs`): `{"registered":0}`, so the inline axes only.
- ADVISORY: this log gates nothing.

## Findings

### Determinism / correctness (P5)

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: ".dev/features/core-162-nothing-to-change/PLAN.md:43"
  problem: "The snapshot answers changesNothing outside the lock, so a 'nothing to change' verdict skips the lock entirely; the plan does not say why that is safe."
  evidence: "skip the future-tense pre-confirm notes, the confirm, the lock and every write"
```

Resolution for build: it is safe because nothing is written, and the lock exists only to serialise writers. A concurrent writer's changes are picked up by the next run. State this in the code comment, and keep the second check under the lock (`applyPlannedUpdate` short-circuit) for the opposite race.

```yaml
- type: FINDING
  rule_id: P5
  severity: important
  file: ".dev/features/core-162-nothing-to-change/PLAN.md:95"
  problem: "Resolving only the loaded side would leave a withheld run with an absent commit unequal forever: nextConfig copies config.commit (undefined), so the written side also needs absent ≡ null, or the predicate never settles."
  evidence: "`commit` → `x.commit ?? null` (absent ≡ null, whether or not CORE-160 has landed)"
```

Resolution for build: `loadResolved` is ONE function applied to both sides, as the gate-1 note says. It is not a written-side special case; it is the reader's view of each object. Pin it with the absent-commit test (withheld run → second run changesNothing, file byte-identical).

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/core-162-nothing-to-change/PLAN.md:83"
  problem: "No eval pins that each re-open cause still produces a write: a channel switch, an old-format models block, a stale records stamp, a missing recorded file. If the predicate wrongly said 'nothing', those runs would silently stop recording their change."
  evidence: "unit (`update-next`): `changesNothing` false for each single clause"
```

Resolution for build: the existing `tests/update.test.ts` cases for those re-opens assert their writes (the recorded `ref`, the converted models, the re-stamped store, the restored file). Run them unchanged as the regression net, and add one unit case each for `ref` change and stamp change in `update-next.test.ts`.

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/core-162-nothing-to-change/PLAN.md:80"
  problem: "The --force order test asserts a note before the confirm, but not that the note lists pharn.config.json when the models block is forced."
  evidence: "a note listing the edited file is recorded BEFORE the confirm call"
```

Suggestion: cover the config line in `update-render.test.ts` (`forcedOverwriteSections` with `models.backup: true`).

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/core-162-nothing-to-change/PLAN.md:71"
  problem: "'The three surfaces agree' is called floor 'by construction', but the dry-run outro and the real outro each format their own text; only the boolean is shared."
  evidence: "one boolean on `UpdatePlanReport`, read by all three"
```

Resolution for build: share the verdict string (`noChangeVerdict`) between the two outros so the wording cannot drift either.

### Honest scope (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/core-162-nothing-to-change/PLAN.md:101"
  problem: "Writing the records commit stamp as `nextCommit ?? null` changes what update writes for an absent-commit config, which overlaps CORE-160."
  evidence: "The records store's `commit` stamp is written as `apply.nextCommit ?? null`"
```

Accepted: without it, the gate-1 absent-commit test cannot pass (the store would be written unreadable every run). Once CORE-160 lands it is a no-op; name it in the PR body.

## Summary

The plan is coherent. The main risks are the predicate saying "nothing" when a re-open's change is real, and the absent-commit case never settling. Both have concrete test resolutions above.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 3 important, 3 minor), for the human to weigh before /pharn-dev-build.
