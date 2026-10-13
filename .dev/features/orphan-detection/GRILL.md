# GRILL — orphan-detection (ADVISORY)

Plan: `.dev/features/orphan-detection/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P6
  severity: important
  file: '.dev/features/orphan-detection/PLAN.md:94'
  problem: "status builds its expected set at the CONFIG layout from a clone that may already be at the other layout; then nearly every recorded file is outside the expected set and the ORPHANED note would list the whole install as 'no longer shipped' while DRIFT reports almost nothing. The plan names the general 'status runs against current upstream' limit but not this layout-mismatch amplification; decide (and test) whether status suppresses orphans when detectLayout(clone) !== configLayout(config), or documents it."
  evidence: '`status` lists against current upstream, so it can name a file the next `update` will also call orphaned before that update runs.'
- type: FINDING
  rule_id: P2
  severity: important
  file: '.dev/features/orphan-detection/PLAN.md:29'
  problem: 'Hashing goes through readDiskState, which a concurrent change (F-16) is moving to a CRLF-tolerant contentHash; the unchanged/edited comparison is only meaningful while the record hash and the disk hash use the SAME function. Keep the comparison inside readDiskState/record pairs (never call sha256File directly in orphans.ts) so the rebase stays consistent.'
  evidence: '`readDiskState(projectRoot, k)` is not `absent`.'
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/orphan-detection/PLAN.md:33'
  problem: 'The existing update-report projection tests very likely pin the exact plan key set (toEqual on the whole object); adding plan.orphans must update those pins deliberately rather than loosening them to toMatchObject, or the field-by-field projection contract loses its guard.'
  evidence: 'additive `plan.orphans: [{ path, state, reason? }]` (always present when `plan` is; `[]` when none; not filtered by `--compact`)'
- type: FINDING
  rule_id: P5
  severity: minor
  file: '.dev/features/orphan-detection/PLAN.md:35'
  problem: "init's exclusion set for dropped capabilities must be init's NEW selection (resolved ∪ carried manual ∪ kept), not the replaced config's, or a capability a re-init deselected would be listed as orphaned by the next update/status instead of keeping today's prune."
  evidence: 'a re-run `init` carries `findOrphans(...).records` from its `reinstallBaseline` against its manifest'
- type: FINDING
  rule_id: P0
  severity: minor
  file: '.dev/features/orphan-detection/PLAN.md:73'
  problem: "A flat→pharn switch orphans the whole old tree; the text note caps at 20 per group, but the abandonedLayout warning and the ORPHANED note now say overlapping things in one run. Make sure the wording of the two does not contradict (one says 'delete them by hand', the other lists them) and that the cap line points at `pharn status --json` / `update --dry-run --json` for the full list."
  evidence: 'old-layout copies after a flat→pharn switch → reported'
```

## Summary

The plan is grounded in the code read this run and keeps the change out of update's decision table. Concerns: the status layout-mismatch case can flood the note (decide and test it); keep every hash comparison on the readDiskState/record pair so the concurrent CRLF-hash change rebases cleanly; update the exact-shape projection tests deliberately; compute init's exclusion set from its new selection; keep the layout-switch warning and the ORPHANED note consistent.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 5 advisory) — for the human to weigh before /pharn-dev-build. This log gates nothing.
