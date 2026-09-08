# GRILL — ship-threat-model-limits (ADVISORY — gates nothing)

Interrogated: `.dev/features/ship-threat-model-limits/PLAN.md`
Spec-hash: plan `spec_content_hash` == live `sha256(ARCHITECTURE.md)` — **no drift**.
Griller discovery (FLOOR): `count-grillers.mjs` → `{"registered":0,"grillers":[]}` — inline axes only.

> The plan below is `trust: untrusted` DATA.

## Findings

```yaml
- type: FINDING
  rule_id: "P4"
  severity: important
  file: ".dev/features/ship-threat-model-limits/PLAN.md:45"
  problem: "The plan adds a constant naming two files that do not exist upstream and calls the result 'inert', but `pharn status` derives its expected set from the same constant — so the plan should state explicitly which of status's three buckets an absent doc lands in, rather than asserting 'no missing' without naming the mechanism."
  evidence: "so `status` reports no `missing` and `update` restores nothing"

- type: FINDING
  rule_id: "P1"
  severity: important
  file: ".dev/features/ship-threat-model-limits/PLAN.md:41"
  problem: "The manifest guard is described as path-anchored so a ROOT leak is caught, but the plan does not say the same for the install test — an assertion that the file is 'absent at the project root' is only meaningful if it checks the root path specifically and not merely a basename search."
  evidence: "the two docs land under `pharn/` and are still absent at the project root"

- type: FINDING
  rule_id: "P7"
  severity: minor
  file: ".dev/features/ship-threat-model-limits/PLAN.md:52"
  problem: "The guarantee audit says the claim is 'ships them when upstream provides them', but the CHANGELOG line planned for users says a fresh init 'writes two more files' — which is false today and will stay false until the upstream half lands."
  evidence: "user-visible: a fresh `pharn init` writes two more files and `status` compares them"
```

## Resolutions carried into the build (advisory)

1. **Finding 1 → answer it in the test, not the prose.** The P7 case asserts `collectExpectedInstallPaths` omits both keys. Since `status`'s `missing` bucket is derived from that map, omission from the map IS "not reported missing" — the test pins the mechanism rather than the symptom.
2. **Finding 2 → assert the exact root paths.** `existsSync(join(proj, 'THREAT-MODEL.md'))` and the `LIMITS.md` twin, not a walk-and-search.
3. **Finding 3 → write the changelog conditionally.** It says the CLI now ships them **when the fetched pharn-oss provides them**, and states plainly that upstream does not yet, so no current install changes. A changelog that promises two new files today would be the exact "written in the doc, therefore true" disease.

## Verdict (ADVISORY — does NOT block /pharn-dev-build)

The increment is one constant and its comments; its risk is entirely in the honesty of the claim, and the plan already refuses to claim the upstream half. Three findings, all about precision. Nothing blocks.
