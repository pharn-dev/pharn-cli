# GRILL — models-label-truth (ADVISORY)

Plan: `.dev/features/models-label-truth/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`count-grillers.mjs`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/models-label-truth/PLAN.md:70"
  problem: "The gates/budget doc text may over-claim that pharn-oss rejects a typo in a gates key; upstream only documents rejecting an unknown gate id or invalid JSON."
  evidence: "a typo in `gates` is rejected by pharn-oss's own gate discovery"
- type: FINDING
  rule_id: P4
  severity: important
  file: ".dev/features/models-label-truth/PLAN.md:77"
  problem: "The docs-pin test forbids a phrase list in CLAUDE.md/docs; it must not forbid phrases that the NEW text legitimately negates (for example 'nothing reads this block' inside a quoted correction), and its 'sanity-check against pre-change text' step is not a committed assertion."
  evidence: "none of ... contains \"change both or neither\" or \"never routing that happens\" or \"nothing reads this block\""
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/models-label-truth/PLAN.md:50"
  problem: "Label draft says 'other stages run on the session's model', but a stage that falls back inline also does; the sentence is true only for stages not routed, and 'run directly' must not suggest routed runs ignore frontmatter effort for model (they do ignore it)."
  evidence: "effort is never routed, and other stages run on the session's model."
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/models-label-truth/PLAN.md:112"
  problem: "Restamp condition 'block unchanged' needs a deterministic comparison (parse both JSON objects), not eyeballing."
  evidence: "restamp to 6.55.0 only if the block shown is unchanged"
```

## Summary

The plan is small and well grounded. Concerns: keep the gates/budget wording to what pharn-oss says; make the docs-pin phrases specific and committed as assertions; compare the shown models block to 6.55.0's by parsed JSON equality.

ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 advisory) — for the human to weigh before /pharn-dev-build. This log gates nothing.
