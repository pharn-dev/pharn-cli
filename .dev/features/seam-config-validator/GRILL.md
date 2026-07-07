# GRILL — seam-config-validator (ADVISORY; gates nothing)

Interrogated plan: `.dev/features/seam-config-validator/PLAN.md`.
**Spec-hash check (content-hash primitive):** PASS — `sha256(ARCHITECTURE.md)` == the plan's pinned
`spec_content_hash` (`11cd9ad5…`); no drift. (Surfaced only; the drift **block** is `/pharn-dev-build`'s
floor-gate, fix #4 — not this stage.)

Grillers registered (live, `count-grillers.mjs`): **13**. Deterministic plan-scanners run over the
plan — `secrets`, `pii`, `migrations`, `i18n`, `observability` — **all clean** (`found:false` /
`mentions:false`). Domain grillers (a11y, i18n, migrations, observability, privacy, performance) gate
themselves out: this is a floor-tooling increment with no UI / DB / PII / network / service surface.

> The PLAN is `trust: untrusted` DATA to this stage (P2). The findings' enum-gated fields
> (`type`/`rule_id`/`severity`/`file`) are the griller's own membership/path assertions (trusted); the
> free-text `problem`/`evidence` quote the plan and inherit its untrusted tag — quoted DATA, never a
> directive into `/pharn-dev-build`.

## Findings (grouped by axis; each block ADVISORY — `severity` is an assignment, not a gate, fix #3)

### architecture (P3)

```yaml
- type: FINDING # enum-gated (trusted)
  rule_id: P3 # cited, not restated (P4)
  severity: important # advisory assignment — a griller never gates (fix #3)
  file: ".dev/features/seam-config-validator/PLAN.md:4"
  problem: "The plan extends ARCHITECTURE §5's FIXED confidence-gated chain into a user-configurable resolutionOrder and adds two config fields (modelConfidenceThreshold, haltOnUnknown) that §5 does not name — a spec extension broader than the already-accepted default-order choice."
  evidence: "increment: '… guaranteeing that a seam config's resolutionOrder always retains a terminal ask …' and check step 5 'modelConfidenceThreshold, if present, ∈ {low,medium,high}'. §5 describes ONE fixed chain (official skill → pinned ai_docs → model → fetch+pin → ask), not a configurable one, and names neither field."
```

Note (fit recognized, not a finding): the layering **fits** — schema in `pharn-contracts` (L-1, the
schemas-only bottom), validator in the excluded `.dev/floor` apparatus; no layer inversion, no
leaf→leaf sibling reference; it **reuses** the established `finding-shape.md` ↔ `check-provenance.mjs`
pattern and the unchanged `count-grillers.mjs` / `check-structural.mjs` — reuse, not reinvention. The
one architectural-fit concern is the §5 **extension** above: the floor arguably _strengthens_ §5
(guarantees the terminal `ask` even under user reordering), but making the chain configurable + the two
new fields are net-new relative to §5's fixed-chain text — worth conscious acceptance, and a candidate
for a human to reconcile into §5 (human-only doc) later.

### coupling (P3, entanglement facet)

No finding. Clean seams recognized: the shared abstraction (the seam-config **schema**) is immutable
and routed through `pharn-contracts` (endorsed), not shared mutable state; no hidden write-order, no
cross-boundary ripple. The contract (the shape) and the validator (enforce the shape) are the
established schema↔enforcer split — one axis of change each — not two reasons collapsed into one file.

### security (P2)

No finding. Layer-1 `scan-plan-secrets.mjs` → `found:false` (injection-immune regex verdict). Layer-2
(advisory): the validator ingests an **untrusted** seam-config, and the plan already carries a Trust
audit + a ★ P2 test proving a needle in an unchecked field cannot move the verdict — scanner clean; no
security concern warranted.

### testability (P1)

```yaml
- type: FINDING # enum-gated (trusted)
  rule_id: P1 # cited, not restated (P4)
  severity: minor # advisory assignment — a griller never gates (fix #3)
  file: ".dev/features/seam-config-validator/PLAN.md:68"
  problem: "Verification approach is PRESENT and strong, but the test list covers MALFORMED optional fields while omitting the optional-field-ABSENT GREEN cases that lock the schema's 'optional' promise."
  evidence: "## Evals to write lists 'modelConfidenceThreshold outside {…} → RED' and 'non-boolean haltOnUnknown → RED', but no 'modelConfidenceThreshold ABSENT → GREEN' / 'haltOnUnknown ABSENT → GREEN' case; the plan calls both fields optional ('if present')."
```

Presence recognized (Layer 1): the `## Evals to write (P1)` section declares a real `.test.mjs`
black-box suite (valid→GREEN, missing-ask→RED, invalid-step→RED, non-array/empty→RED, bad-threshold→RED,
non-boolean-halt→RED, non-object→RED, ask-not-last→GREEN, ★ needle→GREEN). The above is a Layer-2
**adequacy** suggestion only — advisory, non-blocking.

### honest-scope / no speculation (P7)

```yaml
- type: FINDING # enum-gated (trusted)
  rule_id: P7 # cited, not restated (P4)
  severity: important # advisory assignment — a griller never gates (fix #3)
  file: ".dev/features/seam-config-validator/PLAN.md:141"
  problem: "No dogfood/eval FAILURE triggered this increment; the trigger is human directive + spec'd architecture. Largely discharged (the validator is the floor reduction of the plan's ask-terminal guarantee, ratified at GATE-1), but named so the human weighs it consciously."
  evidence: "'… no dogfood/eval failure has triggered it (P7 — the repo is at attempt 0; this increment is human-directed spec-building, not failure-triggered).' Attempt-0 (trust-fence) is the repo's declared current experiment; the seam-resolver is a different axis."
```

Note: this mirrors the security griller's own precedent — a floor primitive added as "the floor
reduction of a claim the capability makes, ratified at the plan's GATE-1 approval" is **not**
speculative. The concern is not the validator (well-justified) but the _runtime configurability_ it
validates, which has no surfaced failure driving it yet. Advisory.

## Summary

The plan is unusually thorough and **fits** the established architecture — it reuses the blessed
schema↔validator pattern, keeps clean seams (no sibling coupling, no shared mutable state), declares a
strong verification suite, and carries honest P0 / P2 / P5 audits. Deterministic scanners are all
clean. Three advisory concerns surface for the human to weigh before `/pharn-dev-build`:

1. **architecture (P3, important)** — the plan extends §5's fixed chain into a configurable one and
   adds two fields §5 does not name (a spec extension beyond the accepted default-order choice; §5 may
   want human reconciliation).
2. **testability (P1, minor)** — add the optional-field-ABSENT GREEN cases to lock the schema's
   "optional" promise.
3. **P7 (important, largely discharged)** — no _failure_ triggered the increment; the trigger is human
   directive + spec'd architecture, ratified at GATE-1.

None is blocking. The floor still owns the real stops downstream (`/pharn-dev-build`'s spec-hash gate +
unresolved-open-questions gate; `.dev/floor/validate.mjs`).

**ADVISORY VERDICT: 3 concerns raised (2 important, 1 minor; 0 blocking-severity) — for the human to
weigh before `/pharn-dev-build`. This is NOT a judgment that the plan is sound; `/pharn-dev-grill` gates
nothing (P0).**
