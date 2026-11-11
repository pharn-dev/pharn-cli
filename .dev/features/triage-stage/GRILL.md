# GRILL — triage-stage

Plan: `.dev/features/triage-stage/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (no drift).
Registered grillers: `{"registered":0,"grillers":[]}` (`.dev/floor/count-grillers.mjs .`), so only
the inline axes ran.

## Findings

### P4 — docs cite code

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/triage-stage/PLAN.md:68"
  problem: "The planned pharn-config.md sentence says an older pharn 'refuses' a block naming triage; the code does not refuse it — status and update keep the user's block and list it as invalid (models-update.ts keep(), status MODELS note), and only a pharn-oss block naming it would not be applied by init/update (upstream-invalid)."
  evidence: "and that pharn before 0.18.1 refuses a block that names it"
```

### P6 — discovery completeness

```yaml
- type: FINDING
  rule_id: "P6"
  severity: minor
  file: ".dev/features/triage-stage/PLAN.md:31"
  problem: "Discovery names the parity test as the vendored checker's user but misses tests/init-archetype.test.ts:371, which also spawns the vendored checker; it needs no edit, but it now also depends on the frontmatter-core.mjs sibling loading."
  evidence: "The new checker has a static `import … from \"./frontmatter-core.mjs\"`, so the vendored copy cannot load without that sibling."
```

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/triage-stage/PLAN.md:66"
  problem: "CLAUDE.md and src/lib/model-config.ts's header describe the vendored checker as one byte-for-byte, sha256-pinned file; neither is in ## Files. Both stay true (neither says 'only'), so this is a question for the human, not a gap: leave them, or name the sibling there too."
  evidence: "`docs/contributing.md` — refresh procedure step 1 names the sibling"
```

## Summary

The plan is small and grounded in a live diff and a smoke run. The code change is one enum member
whose acceptance is held to pharn-oss by the existing parity test, so the guarantee audit reduces
cleanly (P0). The one substantive concern is wording: the reference doc must say what an older CLI
actually does with a `triage` key (reports it, keeps the user's block, does not apply such a block
from pharn-oss), not that it "refuses" it. The init-archetype test is a second consumer of the
vendored checker; the full suite run covers it. No trust, determinism or scope concerns: the
vendored files are test-only, the branch is a membership test, and the docs edits were asked for.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to
weigh before /pharn-dev-build. This is not a judgment that the plan is sound.
