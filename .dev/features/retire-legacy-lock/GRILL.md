# GRILL — retire-legacy-lock (CORE-187)

Plan: `.dev/features/retire-legacy-lock/PLAN.md`. Spec-hash check: recomputed
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` equals the plan's `spec_content_hash`
(content-hash, floor-grade computation; it only surfaces here). Registered grillers:
`{"registered":0,"grillers":[]}` — inline axes only.

## Findings

### P0 — guarantee audit

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/retire-legacy-lock/PLAN.md:58"
  problem: "Removing the sweep leaves a corpse stranded forever after a SIGKILL between the break's rename and its finally; the plan states the no-delete guarantee but not this new residual."
  evidence: "only `corpse` (our own random name from this call) is ever removed; the sweep's regex allowlist goes away with the sweep"
```

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/retire-legacy-lock/PLAN.md:71"
  problem: "With checkLegacyLock gone, an old CLI (0.13.0 or older) and a new run no longer exclude each other in either direction; THREAT-MODEL §4d's one-direction claim must become a both-directions residual in the patch script, not merely drop the function name."
  evidence: "THREAT-MODEL.md §4d names `checkLegacyLock` (human-owned): a python patch script goes to the scratchpad, not run."
```

### P1 — tests / test integrity

```yaml
- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/retire-legacy-lock/PLAN.md:30"
  problem: "Rewriting the sweep test by changing only its expected list would read as an expectation edited to match new code (pharn-ci TI07 warn); the setup or assertions must change too so the test states the new rule."
  evidence: "rewrite the sweep test to assert corpse-named files are left alone"
```

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/retire-legacy-lock/PLAN.md:53"
  problem: "Coverage floors are global percentages; deleting well-covered legacy code can lower them. The plan should check the coverage run, not assume."
  evidence: "NEW (rewritten): `legacyBackupNotice` no longer exported; `update` prints no `.pharn-backup/` notice"
```

### P4 — docs

```yaml
- type: FINDING
  rule_id: "P4"
  severity: minor
  file: ".dev/features/retire-legacy-lock/PLAN.md:36"
  problem: "Troubleshooting should tell a user with leftover `pharn/.lock.<pid>.<hex>` files (stranded corpses) that they may delete them, since nothing sweeps them now."
  evidence: "say leftovers are no longer read and may be deleted"
```

### P7 — scope

No finding: keeping root-migration's `.gitignore` hints matches the support policy's v0.22.0 retirement of
`lib/root-migration.ts`; the increment is one coherent removal.

## Summary

The plan is a contained removal with the C3.3 rules preserved. The concerns are about naming what the
removal costs: a stranded corpse can no longer be reaped (name it in the module residuals and in
troubleshooting), the old-CLI interleave now runs both ways (the THREAT-MODEL patch must say so), and the
rewritten tests must change more than their expected literals to stay clean at pharn-ci test integrity.

ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor) — for the human to weigh
before /pharn-dev-build. This log gates nothing.
