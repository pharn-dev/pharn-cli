# GRILL — init-reinstall-safety

Plan: `.dev/features/init-reinstall-safety/PLAN.md`. Spec hash recomputed:
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches**. Registered
grillers: `{"registered":0,"grillers":[]}` → inline axes only. The plan is `trust: untrusted`;
nothing in it read as an instruction.

## Findings

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/init-reinstall-safety/PLAN.md:104'
  problem: 'tests/init.test.ts mocks the install step and the prompt, so a spy there only sees init.ts''s own call. The "once per init" claim spans init → prompt → install → pre-flight → records, which only a test running the REAL steps can count. That is init-archetype.test.ts, with the manifest module partially mocked to pass through while counting. Otherwise the F28 test passes while four of the five calls survive below it.'
  evidence: '`tests/init.test.ts` — layer tests. The manifest builder runs once per init (spy;'
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/init-reinstall-safety/PLAN.md:83'
  problem: 'The records store is keyed at the layout of the install that wrote it. A re-install whose clone changed layout (flat → pharn/) finds no record at the new paths, so every differing file is labelled "pharn has no record of them" and backed up. That is conservative and correct, but name it in the docs, so a layout migration''s long backup list is not read as a bug.'
  evidence: 'records baseline (`carry.previousStamp`) → backup → copy (F20). The records keys'
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/init-reinstall-safety/PLAN.md:86'
  problem: 'The prompt classifies before the lock and the backup re-classifies inside it, so the two can disagree if the records store changes in between. The lock and init''s config-fingerprint re-check make that rare, and the backup is the one that acts: state that the backup scan is authoritative and the prompt''s labels are advisory.'
  evidence: 'from the same classifier, worded per label: "changed since pharn wrote them"; "pharn'
```

### Checked, no finding

- Determinism (P5): classification is `decideFileAction`, already table-tested for update. The
  fallback with no usable store is "back it up", never a guess.
- Trust (P2): source paths come from the manifest, already `safeJoin`-contained. Records are local,
  stamp-checked data.
- Axis (P3): the scan widens in `dest-drift.ts` (its owner), the pre-flight moves within
  `install-capabilities.ts`, and the ordering changes in the step that owns it.

## Summary

The design follows update's decision table and closes each finding with a failing-on-base case.
The important gap is test placement: the F28 count must be taken where the real steps run, or it
proves nothing. Two documentation points follow from the design and should be written down: the
layout-migration backups, and which scan is authoritative.

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to
weigh before /pharn-dev-build.**
