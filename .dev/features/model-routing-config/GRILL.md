# GRILL — model-routing-config (advisory interrogation of PLAN.md)

- Plan under interrogation: `.dev/features/model-routing-config/PLAN.md`
- Spec-hash check: **MATCH** — `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` equals the plan's `spec_content_hash`. No drift (the binding block is `/pharn-dev-build`'s floor-gate, not this stage).
- Griller membership (deterministic, `count-grillers.mjs`): **0 registered** → no pluggable grillers to run; inline axes only.
- **This grill-log is ADVISORY end-to-end. It gates nothing.** It surfaces concerns for the human to weigh before `/pharn-dev-build`; it is not a "pass".

## Findings (finding-shape.md; enum-gated fields are the griller's assertions, free-text quotes the plan as DATA)

### Axis: Honest scope / realization gap (P7, P0)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/model-routing-config/PLAN.md:93"
  problem: "The brief's 'bad → reject' is realized only as a standalone validator function; no shipped read/consume path invokes it, so a hand-edited invalid `models` block on disk is not actually rejected by any command this increment ships."
  evidence: "\"Bad model / effort / stage key is rejected.\" → floor: enum membership … Backstopped by the vitest cases. (validateModelRouting is exported + tested, but readPharnConfig is not planned to call it.)"
```

Weigh: wire `validateModelRouting` into `readPharnConfig` now, or defer with the consumer? Caveat if wiring now: `readPharnConfig` today returns `null` on bad shape (→ "run init") and is shared by add/update/status/list — throwing on a bad `models` block changes that contract and widens scope/back-compat surface. Deferring is defensible (the plan labels it), but the human owns the call.

### Axis: One axis of change / layering (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/model-routing-config/PLAN.md:35"
  problem: "The union types (types.ts) and the `as const` runtime allowlists (model-routing.ts) are two sources of truth kept in sync by `satisfies` + a self-validation test — trading drift-proofing for layer purity; deriving the union from the array would invert the types.ts→lib layering."
  evidence: "the `as const` runtime allowlists (`MODEL_IDS`, `EFFORT_LEVELS`, `PIPELINE_STAGES`, each `satisfies readonly …[]` against the types.ts unions)"
```

Acceptable as planned (4-entry sets, drift caught by the `DEFAULT passes validator` test). Surfaced only so the tradeoff is a conscious one at build.

### Axis: Determinism / internal consistency (P5, correctness)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/model-routing-config/PLAN.md:54"
  problem: "DEFAULT_MODEL_ROUTING.stages keys must be a subset of the chosen PIPELINE_STAGES or the constant fails its own validator; it uses `plan` + `review`, both in the human-selected dev-loop set, so it is consistent — but this coupling is load-bearing and only guarded by the `DEFAULT passes validateModelRouting` test."
  evidence: "\"plan\": { … }, \"review\": { … } // cross-model review  (both must remain ∈ PIPELINE_STAGES = plan,grill,build,regress,verify,review,ship)"
```

### Axis: Eval coverage (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/model-routing-config/PLAN.md:77"
  problem: "The validator tests cover a bad *string* and a missing/non-object default, but not a wrong-type primitive value (e.g. `model: 123`, `effort: null`) — the `typeof` guard before membership is therefore untested."
  evidence: "bad **model** string (e.g. `\"gpt-4\"`) → rejects, error names the value."
```

Cheap add: one case asserting a non-string `model`/`effort` is rejected.

### Axis: Honest scope / forward completeness (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/model-routing-config/PLAN.md:34"
  problem: "`models?` is optional (correct for back-compat), and `resolveStageModel` takes a non-optional ModelRouting — so a consumer reading a legacy config with no `models` has no defined fallback here; the 'absent models → DEFAULT_MODEL_ROUTING' path is unhandled (deferred with the consumer)."
  evidence: "and `models?: ModelRouting` on `PharnConfig` (additive/optional → legacy configs still load, P7)."
```

Forward note for the deferred consumer increment, not a defect in this one.

## Prose summary

The plan is unusually clean on the two things this repo cares most about: **every guarantee is floor-reduced or explicitly labeled advisory** (P0 — the "routing takes effect" claim is correctly carved out as out-of-scope, not smuggled in as a guarantee), and the **trust audit is concrete** (enum-validated, no path-join/exec sink, forward obligation named — P2). Scope is coherent and brief-driven, not speculative; the enum choices are human-selected (GATE 1), so nothing is invented.

The one finding worth a human decision is the **realization gap (important)**: "bad → reject" ships as a *function*, but no command actually rejects a bad on-disk `models` block this increment — because consumption is deferred. That is honestly labeled in the plan; the question is only whether to pull read-path wiring forward (with the `readPharnConfig` contract caveat) or leave it with the consumer. The remaining four are minor: a conscious two-SoT tradeoff (P3), a load-bearing default⊆stages coupling to keep aligned (P5), a cheap wrong-type test case to add (P1), and a forward "absent-models fallback" note (P7). None block; all are cheap to absorb at build.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 1 important, 4 minor) — for the human to weigh before /pharn-dev-build.** This is not a "pass" and does not gate the build; the deterministic backstops remain `/pharn-dev-build`'s spec-hash floor-gate (verified MATCH here) and the product floor `npm run check`.
