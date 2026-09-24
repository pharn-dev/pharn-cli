# GRILL — strict-frontmatter-fence

Plan: `.dev/features/strict-frontmatter-fence/PLAN.md` · spec-hash `bca940a5…d729d3c4e` matches live
`ARCHITECTURE.md`. Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: 'P5'
  severity: important
  file: '.dev/features/strict-frontmatter-fence/PLAN.md:5'
  problem: 'Keep line-ending acceptance exactly as today (LF fence only). Silently widening to CRLF would change which upstream files install, beyond this finding.'
  evidence: '`the first line is exactly ---`'
- type: FINDING
  rule_id: 'P5'
  severity: minor
  file: '.dev/features/strict-frontmatter-fence/PLAN.md:7'
  problem: 'Count duplicates by the same anchored key match that reads the value (`^role:`), so an indented or prefixed look-alike (`roles:`, `  role:`) is neither a duplicate nor a value — unchanged from today.'
  evidence: '`a role or applies key that appears more than once`'
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/strict-frontmatter-fence/PLAN.md:30'
  problem: 'The empty-frontmatter eval must put a VALID role/applies in the body, or it passes on the base source for the wrong reason (missing field).'
  evidence: '`empty frontmatter → unknown (not a body read)`'
```

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — all folded into the build.
