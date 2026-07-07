# GRILL — archetype-missing-signal

Interrogated: `.dev/features/archetype-missing-signal/PLAN.md`.
Spec-hash check: `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's `spec_content_hash` (no drift). Registered grillers: **0** (`count-grillers .`), so only the inline Step 2 axes were applied.

> **ADVISORY log — gates nothing.** The one finding below rests on the griller's judgment; it does not block `/pharn-dev-build`.

## Findings (by axis)

### P7 / P5 — scope assumption (missing vs malformed collapse)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/archetype-missing-signal/PLAN.md:26"
  problem: "packageJsonFound is a single boolean, so 'no package.json' (missing) and 'present-but-broken' (malformed / non-object) both map to false — a future caller that wants to distinguish a broken manifest from an absent one is not served. This is a DELIBERATE, human-approved minimal scope (the contract preview grouped missing/malformed as false), not a gap; noted so the boundary is chosen with eyes open, and a later 3-state ('found'|'missing'|'malformed') stays an available, non-speculative follow-up if a real caller needs it (P7)."
  evidence: "missing / parse-error / non-object ⇒ `false`"
```

## Summary

The fix plan is a clean, minimal increment and it satisfies P7 well: the addition is triggered by a **real** surfaced failure (the `archetype-io-boundary` REVIEW.md P5 finding), not a hypothetical, and it changes only the one boundary function + its tests. The audits are sound: `packageJsonFound` reduces to a deterministic boolean (existsSync ∧ parses-to-object) and is pinned by tests (FLOOR); the trust boundary is unchanged (untrusted input → membership + a parse-success boolean → closed enum + boolean, no free-text escape); the "package.json-only / never-executes" property is again honestly labeled **advisory**; and the P3 one-axis split (the co-located return type mirrors `ProjectPackages`) is argued explicitly. The eval set covers the finding-resolving pair directly (frameworkless-valid `found:true` vs missing `found:false`) plus malformed, mis-shaped, and non-object/array branches.

The single concern is a **deliberate, already-approved** scope choice — the boolean collapses missing and malformed — surfaced only so it is a conscious decision, not an accident. It does not block the build.

## Verdict

ADVISORY VERDICT: 1 concern raised (0 blocking-severity, 1 minor/advisory) — for the human to weigh before `/pharn-dev-build`. This is NOT "grill passed" and NOT a guarantee that the plan is sound; `/pharn-dev-grill` surfaces concerns and gates nothing.
