# GRILL — core-179-trim-docs (C4.6, CORE-179)

Plan: `.dev/features/core-179-trim-docs/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e`, equal to the plan's `spec_content_hash` (no drift).
Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

### P0 / P1: guarantee audit and checks

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/core-179-trim-docs/PLAN.md:58"
  problem: "The src-name check matches `.ts`/`.js` basenames and exported identifiers, but not a markdown link into `src/` that names a directory or a file without its extension, so a `](../../src/lib/)` link would pass."
  evidence: "srcnames-grep.sh <worktree> (scratchpad) → no src file path / basename and no exported function or const name"
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/core-179-trim-docs/PLAN.md:59"
  problem: "Moving sections from docs/commands/ to docs/reference/ changes every relative link inside them (`../reference/x.md` becomes `x.md`, `status.md` becomes `../commands/status.md`). The anchor checker catches this only if it is run after the move and before the commit."
  evidence: "check-anchors.mjs <worktree> (scratchpad) → 0 broken relative links / anchors"
```

### P4: docs cite code

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/core-179-trim-docs/PLAN.md:27"
  problem: "Rewritten sentences in the Behavior steps and the troubleshooting index re-state flags and messages. Each one has to be re-checked against src (cli-args OPTIONS, the message strings), not copied from the old text, because the old text predates #412 in places."
  evidence: "Behavior in 6 steps (Node check, lock, config, resolve source, download + plan, nothing-to-change, confirm, apply"
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/core-179-trim-docs/PLAN.md:30"
  problem: "The `130`/`143` exit-code row should name what the run prints (that the project may be partially updated) and that the lock is released, both of which the lock section already says. It should not claim a cleanup the code does not do."
  evidence: "adds `130` SIGINT / `143` SIGTERM on an interrupted run, per `fatal-signal.ts`"
```

### P7: honest scope

```yaml
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/core-179-trim-docs/PLAN.md:31"
  problem: "Cutting the pharn-oss triage/supervise version history from README is upstream feature history, not CLI history. It is not lost only because getting-started's 'After init' keeps that paragraph, and the ledger should say so."
  evidence: "Day-to-day workflow (stage table + 3 lines, pharn-oss version history → link upstream)"
- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/core-179-trim-docs/PLAN.md:41"
  problem: "Repointing links in released CHANGELOG entries is outside the ticket's file list, so keep it strictly to link targets. The pre-existing broken support-policy anchor is not this ticket's to fix (no edit to entry text)."
  evidence: "CHANGELOG.md — repoint the released entries' links to moved/deleted update.md sections"
```

No P2 (no untrusted input), P3 (no code) or P5 (no branch) findings.

## Summary

The plan is a docs-only move-and-trim. Its weak spots are mechanical: links inside moved sections, a
src-link pattern the grep script misses, and re-stated flags and messages that have to be re-checked
against src rather than copied. All three can be checked with the scripts the plan already names, provided the
src-link pattern is added to the grep and the anchor check runs after the move. The "no content lost"
claim stays advisory, carried by the ledger, and the plan labels it that way.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 2 important, 4 minor), for the human to weigh before /pharn-dev-build.
