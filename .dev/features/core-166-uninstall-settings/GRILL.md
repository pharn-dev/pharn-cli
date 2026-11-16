# GRILL — core-166-uninstall-settings

Plan: `.dev/features/core-166-uninstall-settings/PLAN.md`. Spec-hash check: recomputed
`sha256(ARCHITECTURE.md)` = `bca940a5…3c4e`, equal to the plan's `spec_content_hash` (content-hash,
surfaced only; `/pharn-dev-build` enforces drift). Registered grillers (`count-grillers.mjs`): 0 — inline
axes only.

## Findings

### P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/core-166-uninstall-settings/PLAN.md:93'
  problem: "Decision 3 (a deleted file's record is dropped by the next run that plans) has no test proving the drop is ONE-shot: after the dropping run, the next update must change nothing (no confirm, no store rewrite, no loop)."
  evidence: 'A stale record left after the user deleted the file is dropped by the next `update` that plans (store-only rewrite)'
```

Resolution to carry into build (also requested by the orchestrator at GATE 1): a unit case on
`buildUpdatePlan` / `planStateChanges` — store WITHOUT the key and no file → no records change; store
WITH the key and no file → a records change once — plus an integration case: delete settings.json,
`update --yes` against a newer upstream drops the record, then a second `update --yes` (same version) makes
no codeload fetch, prints no confirm, and leaves `pharn.records.json` byte-identical.

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: minor
  file: '.dev/features/core-166-uninstall-settings/PLAN.md:53'
  problem: "The re-run-init integration step is left open ('use the existing re-run helper … if present'); the suite has one (the TTY-stubbed interactive re-run in the root-migration describe), so name it to avoid a weaker dry-run substitute."
  evidence: 're-run `init` (interactive path not reachable via `--yes` on a re-install …'
```

### P0 — guarantee audit

```yaml
- type: FINDING
  rule_id: 'P0'
  severity: minor
  file: '.dev/features/core-166-uninstall-settings/PLAN.md:79'
  problem: "'no new writer of settings.json' is reduced to a grep at build time — a review check, not a floor test; acceptable but should be stated as advisory, with the behavioural floor being the integration test that `update --yes` leaves the file's bytes unchanged."
  evidence: 'no code path added that writes the file (grep at build'
```

### P3 — one axis

No finding: `carriedSettingsRecord` lives in the record-store module (its axis); the uninstall change is
in the uninstall classifier and command. No command→command import.

### P5 — determinism

No finding: every branch is a boolean / key-equality / lstat-entry / hash-equality test.

### P7 — scope

No finding: triggered by a real observed run (ticket evidence: 3 dangling hooks after `init --yes` →
`uninstall --yes`).

## Summary

The plan is narrow and its delete path reuses the existing record-proved classifier. The one real gap is
test coverage for the one-shot drop of a stale record (decision 3), which the orchestrator also asked for;
build should add both a unit and an integration case. The re-run init test should use the suite's
existing TTY-stubbed interactive re-run.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to weigh
before /pharn-dev-build. This is not a judgment that the plan is sound.
