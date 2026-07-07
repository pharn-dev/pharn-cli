# GRILL — capability-resolver (ADVISORY)

Interrogated `.dev/features/capability-resolver/PLAN.md`. Spec-hash check: `sha256(ARCHITECTURE.md)` = `11cd9ad5…d1d969` **matches** the plan's `spec_content_hash` — no drift (the binding block still lives at `/pharn-dev-build`, fix #4). Registered grillers: `count-grillers.mjs` → `{"registered":0}` — no pluggable griller ran; findings below are the inline interrogation only.

> All findings are **ADVISORY** (`/pharn-dev-grill` gates nothing). `severity` is my assignment (advisory, fix #3). `problem`/`evidence` quote the plan (`trust: untrusted`) as DATA. The floor backstops remain at `/pharn-dev-build` (spec-hash + unresolved `## Open questions (HALT)`) and `npm run check`.

## Findings

### P3 — one axis / no sibling imports

```yaml
- type: FINDING
  rule_id: P3
  severity: important
  file: ".dev/features/capability-resolver/PLAN.md:25"
  problem: "resolve-capabilities.ts needs the Archetype type but the plan doesn't pin where it imports it from; importing it from the sibling archetype.ts (rather than the shared types.ts) is a leaf→leaf reference."
  evidence: "`resolveCapabilities(archetypes, index): Selection` … One axis: the selection rule over the index."
```

### P1 — eval coverage (untested axes)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/capability-resolver/PLAN.md:24"
  problem: "Detection ranges over deps ∪ devDeps, but no eval case exercises a framework found ONLY in devDependencies (e.g. vite/@remix-run in devDeps) — the union half is unverified."
  evidence: "Pure deterministic membership over `deps ∪ devDeps` against three documented framework allowlists."
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/capability-resolver/PLAN.md:25"
  problem: "Resolver behavior is unspecified/untested for a duplicate capability name in the index and for an entry with empty applies:[] (neither 'universal' nor a matching archetype) — both are plausible index states once the untrusted index is fetched."
  evidence: "`universal` ⇒ always selected; archetype-gated ⇒ selected iff `applies ∩ archetypes ≠ ∅`, else skipped."
```

### P5 — determinism (underspecified)

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/capability-resolver/PLAN.md:25"
  problem: "'Stable ordering' of selected/skipped names no ordering key; detection pins the enum order (line 38) but selection does not, so the determinism test asserts an order the plan never defines."
  evidence: "else skipped **with a reason string**. Stable ordering."
```

### P4 / P7 — the CapabilityEntry shape

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/capability-resolver/PLAN.md:23"
  problem: "CapabilityEntry.role is narrowed to 'griller'|'lens', diverging from ARCHITECTURE.md §3.1's role enum (skill|lens|validator|verifier|griller|auditor); an installable auditor/skill shipped later would be unrepresentable in the index."
  evidence: "`CapabilityEntry` (`{ name; role: 'griller'|'lens'; applies: 'universal' | Archetype[] }`)"
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/capability-resolver/PLAN.md:23"
  problem: "role is carried in the shape but the selection rule consumes only `applies`; ensure the build adds no selection logic around role this increment (it is for the deferred install/summary), so the field is not a speculative dependency."
  evidence: "role: 'griller'|'lens' … archetype-gated ⇒ selected iff `applies ∩ archetypes ≠ ∅`"
```

## Summary

The plan is tightly scoped, spec-grounded, and its P0 audit is honest (the one thing that could masquerade as a guarantee — "safe against a malicious index" — is explicitly deferred and labeled at line 76, not claimed). The concerns are refinements, not redirections:

- **Two worth acting on before/at build:** route the shared `Archetype` type through `types.ts` so `resolve-capabilities.ts` never imports from its sibling `archetype.ts` (**P3**); and add an eval case for a framework in **devDependencies** so the `deps ∪ devDeps` union is actually covered (**P1**).
- **Four minor:** pin the selected/skipped ordering key so "stable" is testable (**P5**); decide duplicate-name / empty-`applies[]` behavior (**P1**); reconcile the 2-value `role` with §3.1's 6-value enum or justify the narrowing (**P4**); and keep `role` inert in selection logic this increment (**P7**).

None of these touch the increment's spine (deterministic archetype detection → membership selection, install deferred). The residual the human already accepted (Q3) stands and is not re-litigated here: §5's archetype detection is being applied to a **new** purpose — install-time selection — that §5 describes for "which grillers *run*," not "which *install*"; that gap is a known, human-accepted spec residual, not a fresh concern.

ADVISORY VERDICT: 6 concerns raised (0 blocking-severity, 2 important, 4 minor) — for the human to weigh before /pharn-dev-build. This is NOT a "grill passed" and NOT a judgment that the plan is guaranteed sound.
