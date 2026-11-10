# GRILL — update-executable-unit

Plan: `.dev/features/update-executable-unit/PLAN.md` · spec-hash check: recomputed `bca940a5…3c4e` == plan's `spec_content_hash` (no drift). Registered grillers: 0 (`count-grillers.mjs`) — inline axes only.

**This grill-log is ADVISORY end-to-end. It gates nothing.**

## Findings

### Determinism / boundedness (P5, P7)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/update-executable-unit/PLAN.md:23"
  problem: "The hold applies even when the run does not move the version (a same-version re-open via findMissingInstalled, a stale records stamp, frozen capabilities, models conversion, gitignore). A deleted unit file beside an edited one would then never be restored, and findMissingInstalled would re-open every run with no progress — breaking the documented 'bounded re-open' invariant."
  evidence: "if `!force` and a unit file has `action: 'skip'` ... every unit file whose action is `write` becomes `skip` with the new label **`held`**"
```

Suggested resolution: hold only when the run would move the version (`readSkillsVersion(clone) !== config.skillsVersion`). At the same version a restore writes same-version bytes, so no mix is possible. Pass it as a `hold` boolean so `planUpdate` stays pure. Add a test that pins it.

### Docs consistency (P4)

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/update-executable-unit/PLAN.md:21"
  problem: "With commands in the unit, editing a /pharn-* command's model:/effort: frontmatter now also HOLDS the floor and hooks. Every surface that prints the models label (modelsLabelLines, lib/model-config-format.ts) and docs/reference say only that update 'SKIPS it and withholds the bump'. The plan's Files list does not cover that wording."
  evidence: "it is a top-level product command under `.claude/commands/` (`isProductCommandFile`) — **included (Q1, human: yes)**"
```

### Guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: minor
  file: ".dev/features/update-executable-unit/PLAN.md:23"
  problem: "Row-2 files (already identical to upstream) are left as they are, so after a hold the unit may contain new-version bytes that pharn did NOT write. The plan labels 'coherent at the old version' advisory, which is correct. The user-facing docs must not shorten that to 'all at the old version'."
  evidence: "Row-2 `noop` files are untouched (already at the new bytes; nothing written)"
```

### Report timing (P6)

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/update-executable-unit/PLAN.md:28"
  problem: "The real run asks 'Apply this update?' after showing membership changes only. The hold is first shown after the apply. A user who would rather revert their edits first learns this too late (the dry run does show it)."
  evidence: "text (real run and `--dry-run`): an `EXECUTABLE UNIT` note listing the blocking files"
```

Suggested resolution: print the future-tense EXECUTABLE UNIT note from the snapshot plan before the confirm, the way `reportCapabilityChanges` is printed. The locked re-plan stays authoritative, and the post-apply note restates it.

### Layout move (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/update-executable-unit/PLAN.md:19"
  problem: "Membership uses the clone layout's floor. In a flat→pharn layout move, every new floor file is 'restored' at a new path. Only an edited hook or command can trigger the hold. No eval covers that path."
  evidence: "it is under `layoutPaths(cloneLayout).floor + '/'`"
```

## Summary

The design is small and every branch is a membership test. The main gap is boundedness: an unconditional hold turns today's bounded same-version restore into a re-open that never makes progress. Gating the hold on a version move fixes that. It is also the honest scope, because the measured failure is a version move. Second gap: the models-label wording becomes incomplete once commands join the unit. Three minor points: docs wording for the row-2 caveat, naming the hold before the confirm, and a layout-move test.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 2 important, 3 minor) — for the human to weigh before /pharn-dev-build.
