# GRILL — config-capability-name-validation

Plan: `.dev/features/config-capability-name-validation/PLAN.md` · spec-hash check: `bca940a5…d729d3c4e` matches live `ARCHITECTURE.md` (no drift).
Registered grillers: `{"registered":0,"grillers":[]}` → inline axes only.

## Findings

### P1 — eval coverage

```yaml
- type: FINDING
  rule_id: 'P1'
  severity: important
  file: '.dev/features/config-capability-name-validation/PLAN.md:47'
  problem: 'The ingest check affects every command, but only remove/list are named in the end-to-end evals; update/status/add rely on the shared loader being exercised once.'
  evidence: '`loadConfigOrExit` / `list --json` route the new error to the named message + exit 1'
```

Advisory: acceptable because all four go through `loadArchetypeConfigOrExit` → `loadConfigOrExit`; one loader test covers the shared path.

### P4 — docs

```yaml
- type: FINDING
  rule_id: 'P4'
  severity: minor
  file: '.dev/features/config-capability-name-validation/PLAN.md:34'
  problem: "SECURITY.md edit is conditional ('if SECURITY.md enumerates them'); it does — line 64 lists records/lock as local-but-user-editable sidecars and omits pharn.config.json."
  evidence: '`SECURITY.md` — list `pharn.config.json` `capabilities[]` beside records/lock ..., if SECURITY.md enumerates them'
```

### P7 — scope

```yaml
- type: FINDING
  rule_id: 'P7'
  severity: minor
  file: '.dev/features/config-capability-name-validation/PLAN.md:31'
  problem: 'Rejecting non-object entries is a new refusal beyond name/role; justified (consumers dereference .name) but should be stated in the error message so the hand-edit is fixable.'
  evidence: 'each entry: plain object, `name` via `assertSafeString(…, CAPABILITY_NAME_RE)`'
```

## Summary

The plan closes the reproduced defect at two independent floors (ingest regex/enum + strict-child
containment at the delete). Symlinked components are correctly deferred to PHARN-02. Concerns are
coverage/documentation completeness, not design.

ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory) — for the human to weigh before /pharn-dev-build.
