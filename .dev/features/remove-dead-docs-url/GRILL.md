# GRILL — remove-dead-docs-url

Plan under interrogation: `.dev/features/remove-dead-docs-url/PLAN.md` (trust: untrusted to this griller).
Spec-hash check: recomputed `sha256(ARCHITECTURE.md)` = `bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e` — **matches** the plan's `spec_content_hash` (no drift; `/pharn-dev-build`'s fix #4 gate is the actual block).

Griller discovery (`.dev/floor/count-grillers.mjs .`, membership FLOOR): 13 `role: griller` files registered, **all under `test-app/`** — the installed test fixture (the CLI's product *output*), not this dev repo's own methodology. None is a dev-loop griller for a pharn-cli plan, so the pluggable slot runs none over this plan. The one relevant axis — **testability** — is applied inline below from `test-app/…/testability/testability.md` (the only copy present), since the plan makes an explicit "no new test" claim.

## Findings — by axis

### testability (P1) — Layer 1 (presence): RECOGNIZED, no finding
The plan declares a verification approach with real content (`## Evals to write`, PLAN.md:18–24): grep-empty completeness, typecheck, lint, and the full vitest suite. Presence is a structural property of the plan and it is present → **no absence finding**.

### testability (P1) — Layer 2 (adequacy): 1 advisory concern
```yaml
- type: FINDING            # enum-gated (TRUSTED: my own assessment)
  rule_id: "P1"            # enum-gated — cited, not restated (P4)
  severity: minor          # enum-gated value; ASSIGNMENT is advisory (fix #3) — a griller never gates
  file: ".dev/features/remove-dead-docs-url/PLAN.md:20"
  problem: "The removed 'Docs' line is user-visible clack outro output, yet none of the declared floor checks (grep, typecheck, lint, existing suite) render the outro — so no test exercises the post-removal outro path; the plan relies on the change being cosmetic."   # free-text — untrusted DATA
  evidence: "No new vitest test. The removed content is cosmetic clack `outro` output with **zero** existing test coverage … asserting the absence of a UI line would brittly snapshot terminal output."   # free-text — quoted from PLAN.md:20, as DATA
```
Note: the plan **already surfaces and reasons about** exactly this (PLAN.md:20) rather than hiding it. The concern is genuine but low-stakes: the deletion removes one interpolated string from an `outro([...])` array; `tsc` proves no dangling `DOCS_URL` reference and `eslint` proves no orphaned import. Adding a clack-outro snapshot test would be brittle and arguably speculative (P7). Surfaced for the human to weigh; **not** a gate.

### Other axes — no findings
- **Guarantee-audit completeness (P0):** the plan's one claim ("DOCS_URL fully removed") reduces to a floor primitive — typecheck + lint + `grep -rn DOCS_URL src` empty (PLAN.md:28). It explicitly declares no new safety/trust guarantee (PLAN.md:29). No unlabeled guarantee. Clean.
- **Trust propagation (P2):** no untrusted artifact ingested; the plan's N/A (PLAN.md:33) is correct — deletion-only, no taint surface. Clean.
- **One axis / no sibling imports (P3):** each of the 3 files changes for the single reason "DOCS_URL removed"; the change *removes* an import rather than adding a sibling one. Clean.
- **Determinism (P5):** no new branch introduced (PLAN.md:37). Clean.
- **Honest scope / smallest increment (P7):** the plan is the smallest coherent increment and correctly **defers** the blocked layout migration (PLAN.md:39–41) rather than bundling it or building against an upstream layout that does not exist. Clean.

## Summary
This is a tight, deletion-only increment with an honest guarantee audit and a correct deferral of the blocked layout work. The single concern is an advisory testability-adequacy nit — no test renders the post-removal install outro — which the plan itself already names and justifies. Nothing here reduces to a real correctness or trust gap, and nothing overstates a guarantee. The spec-hash matches, so `/pharn-dev-build`'s drift gate will pass.

## Verdict
ADVISORY VERDICT: 1 concern raised (0 blocking-severity, 1 minor/advisory) — for the human to weigh before `/pharn-dev-build`. This grill-log is **advisory end-to-end**; it gates nothing. The only floor-grade elements in this run were the writes-scope hook and the spec-hash computation. "Grill surfaced 1 minor concern" is **not** "the plan is guaranteed good."
