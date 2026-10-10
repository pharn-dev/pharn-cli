# GRILL — update-dry-run-json (ADVISORY)

Plan: `.dev/features/update-dry-run-json/PLAN.md`. Spec-hash check: `bca940a5…3c4e` equals the plan's `spec_content_hash` (match). Only the inline axes ran. Everything below is advisory and gates nothing; the plan's Discovery bullet about missing helpers is superseded by its "Resolved decisions" section.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/update-dry-run-json/PLAN.md:101"
  problem: "'stdout carries exactly one object' reduces only to spies on console.log and @clack/prompts. Other writers exist outside those spies (process.stdout.write in helpers, clack calls inside resolveSource/fetchRepo/loadArchetypeConfigOrExit/reportLayoutWarnings, console.log in imported libs), so the claim is test-scoped, not floor-grade."
  evidence: "floor reduction = membership test on the call spies"
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/update-dry-run-json/PLAN.md:60"
  problem: "The early-return predicates (ahead-of-release, same-version re-opened gates) are inline in runArchetypeUpdate beside outro() calls; 'computed once and passed to both' needs a concrete shape, and each of the four gate-reopeners (force, frozen, convertModels, switchChannel) needs its own json case, or up-to-date vs planned is under-tested."
  evidence: "The early returns reuse the exact predicates runArchetypeUpdate already has"
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/update-dry-run-json/PLAN.md:57"
  problem: "Presence test Boolean(argv[flag]) reads '--dry-run=false --json' as unmet, which is right, but '--json=false --dry-run' is silently accepted as text mode; the plan lists the first and not the second."
  evidence: "--dry-run=false --json refuses"
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/update-dry-run-json/PLAN.md:80"
  problem: "update.ts (1157 lines) gains a second output mode on the same flow; the json branch threads through runUpdate, runArchetypeUpdate and runDryRun, so one file now has two reasons to change (text rendering, json emission). The shared fetchAndPlan helps; the early-return emission does not."
  evidence: "json branch, fetchAndPlan extraction, checkMinCli returns warning"
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/update-dry-run-json/PLAN.md:42"
  problem: "archetypes, channelChange and capabilities.count are not in the requested scope list; each is cheap but speculative."
  evidence: "\"archetypes\": [...], \"channelChange\""
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/update-dry-run-json/PLAN.md:70"
  problem: "cap() limits are named for free-text fields only; rel paths, capability names and the release tag are trusted-by-validation but unbounded in the output, and 'defense in depth' is asserted without a test case naming it."
  evidence: "already validated ... but are escaped by the same serializer anyway"
```

## Verdict

Proceed with care: build can start. Two things to settle in the build: a concrete early-return shape with one test per gate-reopener, and a test that records every stdout write path (process.stdout.write as well as console.log) for the success and early-return cases. Advisory only.
