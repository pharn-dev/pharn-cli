# REVIEW — models-label-truth (advisory except the floor line)

Floor: `node .dev/floor/validate.mjs .` exit 0 (GREEN). Lenses applied: L-floor (P0), L-eval (P1), L-trust (P2), L-axis (P3).

## Floor-gate findings (blocking)

None.

## Advisory findings

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "docs/reference/pharn-config.md:130"
  problem: "The per-mode routed-stage list is pharn-oss's policy as of 6.55.0 and can change; the doc says so ('as of pharn-oss 6.55.0 ... can change') and cites stage-agent-core.mjs, so it is labeled, not a guarantee."
  evidence: "As of pharn-oss 6.55.0, `/pharn-ship` routes plan, grill, test and build"
- type: FINDING
  rule_id: P1
  severity: minor
  file: "tests/docs-models-claims.test.ts:1"
  problem: "The docs pin is substring-based, so a harmless rewording of the pinned sentences fails it; that is the intended cost of pinning doc claims, but it needs updating with the docs."
  evidence: "expect(text).toContain('**effort** is never routed');"
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/models-label-truth/PLAN.md:22"
  problem: "The writes-scope parser takes only the first back-tick path per bullet; the plan's Files bullets were split during build so all 15 paths were scoped. Process note, no product impact."
  evidence: "writes-scope set: 12 path(s) from .dev/features/models-label-truth/PLAN.md"
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".pharn/writes-scope.json:1"
  problem: "`.pharn/writes-scope.json` is a tracked file and shows as modified from the setter runs; it must not be committed with the increment."
  evidence: "M .pharn/writes-scope.json"
```

L-trust: no ingest added; the label is a constant string. L-axis: each file keeps one reason to change. L-eval: label and docs claims each have a pinning test.

VERDICT: GREEN — 0 blocking floor findings, 4 advisory (minor).
