# GRILL — dry-run-json-compact (ADVISORY)

Plan: `.dev/features/dry-run-json-compact/PLAN.md`. Spec-hash check: `bca940a5…3d4e` recomputed, equals the plan's `spec_content_hash` — no drift. `count-grillers.mjs`: `{"registered":0}` — no griller capabilities registered, inline axes only.

## Findings

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/dry-run-json-compact/PLAN.md:46'
  problem: 'The early-return path has TWO emit sites (emitEarlyReturn and runDryRun) plus the planned path; the plan says compact is threaded through both but the `compact` option is a closure input in runUpdate, so a missed site silently emits an unmarked, unfiltered report.'
  evidence: 'thread `compact` through `runDryRun`/`fetchAndPlan` JSON sites and BOTH early-return `buildUpdateReport` calls'
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/dry-run-json-compact/PLAN.md:49'
  problem: "The byte-identical default is pinned by a golden 'equal to the pre-change builder output', which no longer exists after the change; the golden must be a committed literal or sha256, captured BEFORE editing update-report.ts."
  evidence: 'serialized bytes equal to a pinned literal / equal to the pre-change builder output for the existing fixture'
- type: FINDING
  rule_id: P0
  severity: minor
  file: '.dev/features/dry-run-json-compact/PLAN.md:76'
  problem: "The audit labels the golden test 'content-hash style'; a test over fixtures is not a floor primitive. It is correctly caveated as advisory beyond fixtures, but the 'floor' label should read test-pinned."
  evidence: 'floor: **content-hash** style check — a golden test comparing serialized bytes'
- type: FINDING
  rule_id: P1
  severity: important
  file: '.dev/features/dry-run-json-compact/PLAN.md:51'
  problem: 'Adding a flag to ALLOWED_FLAGS.update may break other tests that enumerate the row or the usage text (e.g. tests asserting the exact flag set or USAGE), and the per-command refusal tests are not listed beyond the five commands named.'
  evidence: '`--compact` refused as unsupported on `status`/`list`/`add`/`remove`/`init`'
- type: FINDING
  rule_id: P4
  severity: minor
  file: '.dev/features/dry-run-json-compact/PLAN.md:56'
  problem: "Line 56 still says CLAUDE.md is NOT edited and defers to a later decision, but Resolved decision 6 says the build edits it; CLAUDE.md is also not in the build command's declared writes unless it lists it."
  evidence: '`CLAUDE.md` — NOT edited in this plan; the build step may need to add `compact`'
- type: FINDING
  rule_id: P7
  severity: minor
  file: '.dev/features/dry-run-json-compact/PLAN.md:30'
  problem: '`--compact --json` without `--dry-run` reports only the json requirement, so a user needs two attempts; acknowledged and accepted, noted so the docs/troubleshooting row says it.'
  evidence: 'one more error is revealed after the user fixes it'
```

## Summary

The plan is grounded in live code (noop ⇔ `ok` ⇔ `counts.ok`, single-level `unmetRequirements`, derived flag declarations). Concerns are test-shape ones: capture the byte-identical golden before editing, assert all three emit sites, sweep tests that enumerate flags or USAGE, and reconcile the CLAUDE.md line with Resolved decision 6.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 6 advisory) — for the human to weigh before /pharn-dev-build. This log gates nothing.
