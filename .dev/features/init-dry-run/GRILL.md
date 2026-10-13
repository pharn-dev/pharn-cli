# GRILL — init-dry-run (ADVISORY)

Plan: `.dev/features/init-dry-run/PLAN.md`. Spec-hash check: `bca940a5…3c4e` matches the plan's `spec_content_hash`. `node .dev/floor/count-grillers.mjs .` → `{"registered":0,"grillers":[]}`, so only the inline axes ran. Everything below is advisory and gates nothing.

## Findings

```yaml
- type: FINDING
  rule_id: P3
  severity: important
  file: ".dev/features/init-dry-run/PLAN.md:61"
  problem: "commands/init.ts would gain three output modes (interactive, --yes, --dry-run text/json) on top of the flow it owns; the text preview renderer (PLAN/HOOKS/models/outro) is a second reason to change. It also needs MARKERS, which the plan exports from steps/overwrite-check.ts — a command may import a step, but a separate preview step could not (step→step). Put MARKERS in lib/write-targets.ts beside planWriteTargets and keep the text renderer small, or give it its own step that reaches only lib/."
  evidence: "option plumbing, json/dry-run/yes branches, TTY-gate condition + message"
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/init-dry-run/PLAN.md:98"
  problem: "The --yes guarantee rests on conflictingWriteTargets (existsSync over manifest ∪ pharn.config.json). existsSync FOLLOWS links, so a dangling symlink at a target reads as absent, and --yes would proceed. The pre-flight refuses dangling links at .claude/settings.json and links on the path, but the test plan should name the dangling-leaf case explicitly so the claim is demonstrated rather than inferred from prepareInstall."
  evidence: "membership test — conflictingWriteTargets(...) (existsSync over manifest ∪ config) must be empty"
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/init-dry-run/PLAN.md:90"
  problem: "The dry run's parity test compares overwrite/backup sets with a later real run, but the dry run's preserved-settings / hooks verdict and the models outcome are computed by different calls than runInstallArchetype makes (existsSync before vs. during the copy; readUpstreamModels twice). Add a parity case for settings preserved + HOOKS note text, so the preview and the real run cannot drift apart silently."
  evidence: "parity: the dry run's overwrite/backup sets equal what a subsequent real run warns about and backs up"
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/init-dry-run/PLAN.md:55"
  problem: "Under --yes the summary prompt is skipped, but the summary note itself (what is about to be installed) should still print in text mode — otherwise a CI log of a --yes install says nothing about which capabilities were selected. The plan does not say whether the note prints."
  evidence: "the summary prompt is skipped (`action = 'install'`)"
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/init-dry-run/PLAN.md:37"
  problem: "carriedConfigKeys echoes KEY NAMES from the user's pharn.config.json into stdout JSON and the text note; they are local, not upstream, but arbitrary strings. The plan caps/escapes them in JSON; the text path should pass them through terminalSafe too, and a test should feed a control-char key."
  evidence: "user-owned keys that would be carried"
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/init-dry-run/PLAN.md:77"
  problem: "The Files list names 'tests/prereqs.test.ts (or existing equivalent)'; the file exists as tests/prereqs.test.ts, so the hedge should go — build's writes-scope is parsed from these back-tick paths."
  evidence: "`tests/prereqs.test.ts` (or existing equivalent)"
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/init-dry-run/PLAN.md:45"
  problem: "yesWouldProceed is derivable from counts.overwrite === 0; it is a convenience field, cheap but redundant. Acceptable if documented as exactly that equality."
  evidence: "Adds `yesWouldProceed: counts.overwrite === 0`"
```

## Summary

The design reuses the update precedent closely, and the real-run ordering is preserved. Three things to settle in the build:

1. Keep `MARKERS` and the label order in `lib/write-targets.ts`, so no step-to-step import appears.
2. Demonstrate the `--yes` membership claim on a dangling-symlink target.
3. Pin settings and HOOKS parity between the preview and a real run.

Also: print the summary note under `--yes`, and pass carried key names through `terminalSafe` in text mode.

ADVISORY VERDICT: 7 concerns raised (0 blocking-severity, 3 important, 4 minor) — for the human to weigh before /pharn-dev-build. Advisory only; this grill-log gates nothing.
