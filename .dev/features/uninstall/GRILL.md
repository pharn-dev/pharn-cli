# GRILL — uninstall (ADVISORY)

Plan: `.dev/features/uninstall/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` recomputed = `bca940a5…3d3c4e`, equals the plan's `spec_content_hash` (no drift). Registered grillers: 0 (`node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`), so only the inline axes ran.

## Findings

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/uninstall/PLAN.md:41'
  problem: "The surface predicate is a hand-written MIRROR of collectExpectedInstallPaths' filters; if upstream adds a surface the manifest learns but the predicate does not, those files are silently left (safe direction) — the mirror test must run a REAL install over a fixture that exercises every surface (both layouts, LICENSE mapping, pharn-core, both features-README spellings), or the pin is weaker than it reads."
  evidence: 'A mirror test pins that every path a real `installCapabilities` run records satisfies the predicate.'
- type: FINDING
  rule_id: P2
  severity: important
  file: '.dev/features/uninstall/PLAN.md:41'
  problem: 'The capability-subtree branch of the predicate must constrain the <name> segment (CAPABILITY_NAME_RE) and require at least one segment below it; otherwise a key equal to the subtree itself or a bare capability dir would pass. Records keys are already `..`-free, but the predicate is the defense-in-depth layer and should be tight on its own.'
  evidence: 'capability subtree `/<name>/…`'
- type: FINDING
  rule_id: P0
  severity: important
  file: '.dev/features/uninstall/PLAN.md:46'
  problem: 'The rmdir climb can remove `.claude/` itself (or `pharn/`) when it ends up empty; that is harmless but must be stated in the docs, and the climb must use the same lexical root bound as safeJoin so it can never rmdir the project root or anything above it — test it with a file whose only ancestor chain becomes empty.'
  evidence: 'never the project root, never above it'
- type: FINDING
  rule_id: P2
  severity: minor
  file: '.dev/features/uninstall/PLAN.md:56'
  problem: "hooksReferencing prints PROJECT-side hook entries, reversing hook-wiring.ts's stated rule that only upstream entries reach a terminal. Escaping via displayHook covers control characters, but the header and a test with a control-char command must make the new behaviour explicit."
  evidence: 'Header updated: project entries are now printed too, but only through `displayHook`.'
- type: FINDING
  rule_id: P5
  severity: minor
  file: '.dev/features/uninstall/PLAN.md:64'
  problem: "The PLAN note is computed before the prompt and re-computed under the lock; if they differ (an edit while the prompt was open), the summary must report the IN-LOCK result, never the prompt's counts."
  evidence: 'Print a `PLAN` note: N files to delete, edited files kept (listed, capped)'
- type: FINDING
  rule_id: P0
  severity: minor
  file: '.dev/features/uninstall/PLAN.md:135'
  problem: "On a resumed run after a partial failure, the config is backed up a SECOND time into a new .pharn-backup/<ts>/; harmless, but the docs' resumability sentence should not imply a single backup."
  evidence: '"a partial failure is resumable" → ordering argument (config deleted last), advisory, tested once.'
- type: FINDING
  rule_id: P4
  severity: minor
  file: '.dev/features/uninstall/PLAN.md:98'
  problem: "Several surfaces enumerate the commands (USAGE, README, docs/README.md, CLAUDE.md's dispatch prose naming seven literal keys in index.ts comments). The index.ts comment 'one of the seven literal keys' becomes stale and should be updated with the table."
  evidence: '`src/index.ts` — USAGE, `MAX_POSITIONALS`, `ALLOWED_FLAGS`, import, dispatch case — layer: dispatch'
```

## Summary

The plan is grounded in the code read this run, keeps the new verb offline, and deletes by a membership + byte-equality rule with an extra surface bound. Concerns: make the surface-predicate mirror test exercise every surface; keep the capability branch of the predicate tight on its own; state and test that the rmdir climb may remove an emptied `.claude/`/`pharn/` but never the root; make printing project hook entries explicit in hook-wiring's header with an escaping test; report in-lock (not pre-prompt) results; avoid implying a single config backup on a resumed run; refresh the "seven literal keys" comment in index.ts.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 7 advisory) — for the human to weigh before /pharn-dev-build. This log gates nothing.
