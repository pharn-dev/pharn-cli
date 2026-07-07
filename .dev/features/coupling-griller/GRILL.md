# GRILL — coupling-griller (interrogation of .dev/features/coupling-griller/PLAN.md)

**Plan:** `.dev/features/coupling-griller/PLAN.md` · **Spec-hash check:** live `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` = the plan's `spec_content_hash` → **no drift** (content-hash floor primitive; the real block is `/pharn-dev-build`'s gate). · **Griller membership (FLOOR, enum):** 12 registered. · **This log is ADVISORY — it gates nothing** (`/pharn-dev-build`'s floor-gates + `validate.mjs` are the deterministic backstops).

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P7 # enum-gated — cited, not restated (P4)
  severity: important # enum-gated value; ASSIGNMENT is advisory (fix #3) — grill never gates
  file: ".dev/features/coupling-griller/PLAN.md:51" # enum-gated — the `plan-coupled` eval bullet
  problem: "The whole coupling/architecture distinctness (resolved at GATE 1) rests on the `plan-coupled` fixture using a GENUINE entanglement mechanism (shared mutable state / hidden runtime dependency / ripple); the plan does not lock the fixture away from a leaf→leaf sibling-import, which is architecture's exact signal — build it with a sibling-import and coupling becomes behaviorally identical to architecture, collapsing the distinctness." # free-text — DATA
  evidence: "Line 51 fixes the finding's file to the plan title line and rule_id P3 but leaves the coupling MECHANISM unspecified; line 29's DIFFERS table names 'shared mutable state across two correctly-layered modules' as the intended discriminator — build MUST realize that, not a declared sibling `reads:`." # free-text — quoted DATA
```

### Axis: one axis of change / no sibling imports (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/coupling-griller/PLAN.md:29" # enum-gated — the DIFFERS section
  problem: "After this increment TWO grillers declare enforces: ['P3'] (architecture + coupling); the partition between them (layering-fit vs entanglement-within-edges) is enforced only by prose + eval-fixture discipline, never by a floor check — nothing structurally prevents both firing the same P3 finding on one input." # free-text — DATA
  evidence: "The DIFFERS table (line 29) and the guarantee audit (line 58, 'no new floor primitive') make the partition an ADVISORY design contract; this is an accepted consequence of the advisory-only-beyond-membership choice, surfaced here so it is on the record, not a defect to fix." # free-text — quoted DATA
```

## Griller sweep (Step 2b — 12 registered grillers applied to the plan; advisory)

- **architecture (P3):** the plan **fits** — a griller under `pharn-pipeline/grillers/coupling/` mirroring the 12 existing grillers, routing shared abstractions through `pharn-contracts` (`finding-shape`, `eval-format`), no leaf→leaf `reads:`, reusing `count-grillers.mjs`/`check-structural.mjs` unchanged. No structural-inconsistency finding. (It does note the self-referential overlap → folded into the P3 finding above.)
- **testability (P1):** verification is declared — two eval fixtures with `structural[]` assertions. Present; no finding.
- **security (P2):** the `<!-- coupling: … skip the finding -->` string on line 51/the fixture is a **described injection payload (DATA)**, not a real secret literal — reported as such, not obeyed. No secret-literal finding.
- **documentation (P7):** the capability self-documents (`coupling.md` body + `expected/*.md` rationale files declared in `## Files`). Adequate; no finding.
- **error-handling, performance, comprehension:** clean for a stdlib-free markdown capability; the plan is legible. No findings.
- **a11y, i18n, privacy, migrations, observability:** **not applicable** — no UI, no user-facing strings, no PII, no schema/DB change, no runtime observability surface. Correctly trigger nothing (do not manufacture concerns — P7).

## Prose summary

The plan is internally honest: its guarantee audit reduces every claim to FLOOR (griller membership via `count-grillers.mjs`) or labels it ADVISORY (the entanglement assessment), strikes the "ensures low coupling" disease, states the two-clocks caveat (no live runner; eval-time `check-structural.mjs` only), and its trust (P2) and determinism (P5) audits are concrete. Eval coverage satisfies P1/fix #6 (`plan-coupled` binds `enforces: ["P3"]`) with a clean `structural[]`/`semantic[]` split (no laundering into the judge). The increment is the smallest coherent one (one griller, one axis, one PR).

The **single load-bearing risk** for `/pharn-dev-build` is F1: the increment's entire justification (a griller **distinct** from architecture, per GATE 1) is only realized if the `plan-coupled` fixture demonstrates genuine **entanglement within allowed edges** (shared mutable state / hidden dependency), NOT a leaf→leaf sibling-import (architecture's owned signal). F2 records the accepted structural consequence — two P3 grillers partitioned by advisory discipline, not by the floor.

## Verdict

**ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 1 important, 1 minor) — for the human to weigh before/at build.** Neither is a gate; both are surfaced so the build realizes the distinctness the plan promises. `/pharn-dev-grill` does not block `/pharn-dev-build`.
