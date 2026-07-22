# GRILL — publish-oidc-trusted (ADVISORY)

Plan under interrogation: `.dev/features/publish-oidc-trusted/PLAN.md`
Spec-hash check (content-hash floor primitive, surfaced only): recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **MATCHES** the plan's `spec_content_hash`. No drift finding. (The block on drift is `/pharn-dev-build`'s floor-gate, not this stage.)

Griller membership (floor): `count-grillers .` returned 81, but every path is a `test-*/` install fixture (pharn-cli is the installer; canonical grillers ship from pharn-oss). The `testability` axis is applied inline below (Layer 1 present/absent + Layer 2 adequacy).

## Findings (grouped by axis; all advisory — this stage gates nothing)

### Axis: guarantee-audit completeness (P0)

```yaml
- type: FINDING # enum-gated (TRUSTED: my own assertion)
  rule_id: P0 # enum-gated
  severity: minor # enum-gated value; assignment is advisory (fix #3)
  file: ".dev/features/publish-oidc-trusted/PLAN.md:34" # resolves
  problem: "The 'no secrets' absence-grep is labeled FLOOR and 'Verifiable at build/verify', but no standing gate (npm run check, validate.mjs) actually runs it — it is floor-REDUCIBLE, not floor-ENFORCED (the finding-shape.md distinction). Correctly it is a manual verify-time grep, not an always-on gate."
  evidence: "\"**\\\"No secrets appear anywhere in the workflow\\\"** → **FLOOR** (deterministic absence test): `grep -c 'secrets\\.' .github/workflows/publish.yml` == 0. Verifiable at build/verify.\""
```

### Axis: honest scope / smallest increment (P7)

```yaml
- type: FINDING
  rule_id: P7 # enum-gated
  severity: minor
  file: ".dev/features/publish-oidc-trusted/PLAN.md:18"
  problem: "Edit #5 (the tag==package.json version guard) is a release-hygiene concern arguably distinct from the OIDC-auth migration axis — two concerns bundled in one increment. The human's mandate explicitly bundled them; surfaced for awareness, not a block."
  evidence: "\"5. **Add a guard step before Publish** — `TAG=\\\"${GITHUB_REF_NAME#v}\\\"; ... [ \\\"$TAG\\\" = \\\"$PKG\\\" ] || { echo ...; exit 1; }`\""
```

### Axis: testability (griller — Layer 1 floor present/absent, Layer 2 advisory adequacy)

Layer 1 (present/absent, structural): a verification approach **IS present** — the plan's `## Evals to write (P1)` and `## Guarantee audit (P0)` sections declare non-empty, real verification for what it builds (npm run check stays GREEN; a `secrets.` absence-grep; human review + GitHub's parser at release). **No absence finding.** Layer 2 (adequacy, advisory) raises:

```yaml
- type: FINDING
  rule_id: P1 # enum-gated — cited, not restated (P4)
  severity: minor
  file: ".dev/features/publish-oidc-trusted/PLAN.md:27"
  problem: "Adequacy (advisory): the increment's core artifact — the workflow YAML — has NO automated correctness check; the floor only proves the TS product is untouched and that no `secrets.` string remains. YAML validity + 'OIDC actually publishes' rest on human review + GitHub's runtime parser. The plan discloses this honestly, so this is an ACKNOWLEDGED residual, not a hidden gap."
  evidence: "\"**NONE — a deliberate, honest exception, not an omission:** ... Verification is therefore: (a) `npm run check` ... (b) a deterministic absence-grep ... (c) human review + GitHub's own workflow parser at release time (out-of-band).\""
```

## Prose summary

The plan is small, coherent, and unusually honest — its guarantee audit already draws the exact floor/advisory lines this stage exists to check, and the spec-hash matches (no drift). Three **minor** concerns, none blocking:

1. **P0 precision (PLAN.md:34).** The `secrets.` absence-grep is real and deterministic, but calling it "FLOOR … Verifiable at build/verify" slightly overstates: nothing in the standing floor (`npm run check`, `validate.mjs`) runs a grep over `.github/`. It is *floor-reducible* and I (as `/pharn-dev-verify`) can run it, but it is not an enforced gate. Recommend the build/verify step **actually execute** the grep and record its `0` result, so the FLOOR claim is backed by an observed exit, matching finding-shape.md's "floor-reducible-but-not-yet-enforced" honesty.
2. **P7 bundling (PLAN.md:18).** The tag==version guard is a release-safety concern distinct from the auth migration. It's tiny and the human mandated it together, so bundling is defensible — surfaced only so the human is aware two axes ride in one increment.
3. **Testability adequacy (PLAN.md:27).** The workflow itself is unverified by any floor primitive here; correctness is out-of-band (review + GitHub). The plan says so plainly — good — but the human should weigh that the *real* proof this change works is the **first actual release**, which the plan correctly frames as a manual/operational step (external prerequisites (i)–(iii)).

One non-finding note folded into prose (not a separate finding): the plan keeps `--provenance` under OIDC. That is valid (provenance uses the same `id-token: write`), but with npm ≥ 11.5.1 Trusted Publishing it is partly redundant; harmless, and outside the six named edits — left as-is per "No other files."

## Verdict

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 minor) — for the human to weigh before `/pharn-dev-build`.** This grill-log gates nothing; the deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`.
