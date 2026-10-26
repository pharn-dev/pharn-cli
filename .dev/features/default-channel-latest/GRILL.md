# GRILL — default-channel-latest

Plan: `.dev/features/default-channel-latest/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` =
`bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` = the plan's `spec_content_hash` (no drift).
Registered grillers: 0 (`count-grillers.mjs` → `{"registered":0}`), so only the inline axes ran.

## Findings

### Guarantee audit / honest limits (P0)

```yaml
- type: FINDING
  rule_id: "P0"
  severity: important
  file: ".dev/features/default-channel-latest/PLAN.md:99"
  problem: "Making the fail-closed release resolve the DEFAULT moves the unauthenticated 60/h API limit onto every new install, including `pharn status --strict` in CI on shared runner addresses, where a 403 now fails the gate (exit 1); the plan names §3b but not this CI consequence."
  evidence: "§3b: `latest` is the default channel so the two GETs fail closed by default"
```

### Design gaps (P5)

```yaml
- type: FINDING
  rule_id: "P5"
  severity: important
  file: ".dev/features/default-channel-latest/PLAN.md:85"
  problem: "Q2's one-GET path has no commit sha, but `InstallSource` 'release' requires `sha` and `printArchetypeVersion` / `buildStatusReport` take an `InstallSource`; the plan does not say which narrower type status uses, and a fake sha would be a lie in a typed value."
  evidence: "`--no-drift` per Q2. `status --json` keys unchanged"
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/default-channel-latest/PLAN.md:91"
  problem: "The Q3 line depends on 'no `--ref` was passed', but `runInitArchetype` receives only the resolved `channel`; the explicit-flag bit must be plumbed through `RunMode` (and into the dry run) or the line fires for `--ref latest` too."
  evidence: "this run's channel is `latest` (and no `--ref` was passed)"
- type: FINDING
  rule_id: "P5"
  severity: minor
  file: ".dev/features/default-channel-latest/PLAN.md:74"
  problem: "'Printed ONCE per run' is a claim about a function with several exits (early returns, dry run, JSON); the plan should place it at one site above all of them so the count is structural, not per-branch."
  evidence: "Printed ONCE per run (`log.info`) when the channel came from the config"
```

### Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/default-channel-latest/PLAN.md:150"
  problem: "No eval covers `add` after a DEFAULT init (config now records `ref: latest`, so `add` resolves a release) — existing add tests set `ref` by hand; the integration suite is the natural place."
  evidence: "fresh `runInit()` with no `--ref` → `resolveSource('latest')`"
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: ".dev/features/default-channel-latest/PLAN.md:117"
  problem: "Changing the integration stub so the default path works could silently move every integration test onto the release channel and lose the `main`-channel coverage (tip SHA resolve, `ahead-of-main`); the plan should keep at least one `ref: 'main'` integration path."
  evidence: "`tests/support/tar-fixture.ts` — fetch stub serves the release endpoints"
```

### Scope (P7)

No finding: Q1=B removed the schema change; the notice, the status row and the Q3 line each trace to the
brief or a GATE-1 answer.

### Trust (P2)

No finding: the only new remote value is the same `tag_name`, still `RELEASE_TAG_RE`-gated before display.

## Summary

The plan is grounded (live release verified, the existing `update` behaviour correctly identified as
already channel-preserving). The two concerns worth weighing: the availability cost of a fail-closed
default in CI (a docs/limits honesty point, not a code change), and the type the one-GET `status --no-drift`
path carries. The rest are plumbing and test-placement notes for `/pharn-dev-build`.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 3 important, 3 minor) — for the human to weigh;
`/pharn-dev-grill` gates nothing.
