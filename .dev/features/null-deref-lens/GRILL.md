# GRILL — null-deref lens (advisory interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/null-deref-lens/PLAN.md` (`trust: untrusted` to the griller — its self-claims are tested, not believed).
- **Spec-hash check (content-hash floor primitive; surfaced, not blocking here):** recomputed `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **== the plan's pinned `spec_content_hash`**. No drift. (The binding block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — not this stage.)
- **Grillers discovered (deterministic membership, `count-grillers.mjs`):** 13 registered — a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability. Run inline below (the isolated per-griller runner is deferred, P7).

## Findings (finding-shape; enum-gated / free-text split honored — all ADVISORY)

### Axis: eval coverage / structural-semantic split (P1, `eval-format.md`)

```yaml
- type: FINDING # enum-gated (griller's own assertion)
  rule_id: P1 # enum-gated — cited, not restated (P4)
  severity: minor # enum-gated value; the ASSIGNMENT is advisory (fix #3)
  file: ".dev/features/null-deref-lens/PLAN.md:28" # enum-gated — resolves (also applies to :30)
  problem: "The two negative expecteds are described as 'structural[] (finding_count == 0)' only; under skill_kind: llm the precedent expected-proper-handling.json ALSO carries a semantic[] judge, so a build that emits structural-only would drift from the eval-format.md pattern the plan cites."
  evidence: "Line 28: 'expected-guarded-deref.json — structural[] (`finding_count == 0`) for the guarded case'; line 30: same for the `?.` case. Neither mentions a semantic[] judge, unlike swallowed-exception's expected-proper-handling.json."
```

### Axis: testability — scanner test edge-case coverage (P1 / testability griller)

```yaml
- type: FINDING # enum-gated
  rule_id: P1 # enum-gated
  severity: minor # enum-gated value; assignment advisory (fix #3)
  file: ".dev/features/null-deref-lens/PLAN.md:35" # enum-gated — resolves
  problem: "The scanner test line lists '★ injection-immunity + true-negatives (guard / ?.) + fail-closed' but does not enumerate the FIRST-OCCURRENCE edge cases that actually pin the classifier, so the build could ship a scanner whose 'first-match' discipline and source-set bound are under-tested."
  evidence: "Line 35: '.dev/floor/scan-code-null-deref.test.mjs — hermetic tests: ★ injection-immunity + true-negatives (guard / `?.`) + fail-closed'. Missing named cases: (a) a guard placed AFTER the deref → still a HIT (proves first-occurrence, not any-guard-anywhere); (b) a NON-source assignment (`const u = arr[0]` / `const u = makeUser()`) → found:false (bounds false-positives to the fixed source set); (c) `?.[` optional index → CLEAN; (d) a single-letter binding `u` next to a similarly-prefixed identifier (`url`) → strict `\\bu\\b` word-boundary, no false match."
```

## Axes with no finding (interrogated, clean or N/A — stated, not hidden)

- **P0 guarantee-audit completeness — CLEAN.** Every claim reduces to floor (validate membership, scanner=primitive #3, check-structural at eval time) or is labeled `advisory`; the "two clocks" and the struck "ensures null-safety" disease-claim are both explicit. No guarantee rides on "written in the plan."
- **P2 trust propagation — CLEAN.** The trust audit states taint reaches only free-text (`problem`/`evidence`); enum-gated fields come from the scanner/enum; the ★ injection case + `needle_absent_from_enum_gated` demonstrate it; the LIMITS §2 residual is named. Solid.
- **P3 one axis / no sibling imports — CLEAN.** Lens `reads:` cite only `pharn-contracts/finding-shape.md` + `<artifact-under-review>` (no sibling). Lens+scanner is ONE axis ("detect the unchecked-deref shape") — the lens's floor claim requires the scanner (the established swallowed-exception pattern), not two bundled features.
- **architecture griller — CLEAN.** Lens/evals → `pharn-review` (PRODUCT root); scanner+tests → `.dev/floor/` (apparatus, validate-excluded, npm-test-covered). Correct dev/product boundary.
- **coupling griller — CLEAN.** `agnostic` is right by §3.2 Q1 (byte-identical across Next/Remix/SvelteKit + SSR/Backend/SPA); JS/TS-specificity is a LANGUAGE axis, not a framework axis — consistent with the `swallowed-exception` precedent.
- **error-handling griller — CLEAN.** Scanner is fail-closed (missing/non-file → nonzero exit, nothing on stdout); the lens's ambiguous-case fallback is ask-the-human (P5).
- **security / comprehension / documentation / performance grillers — CLEAN / low-risk.** Injection-immunity is the core P2 property (masking + ★ tests); the plan is legible and well-scoped; the scanner is a single-pass O(n) mask+regex over one file.
- **a11y / i18n / migrations / observability / privacy grillers — N/A.** This is a code-analysis methodology increment: no UI, no localized strings, no DB migrations, no runtime telemetry, no PII handling. Nothing for these axes to interrogate.

## Prose summary

The plan is strong and closely mirrors the audited `swallowed-exception` precedent: a real partial floor (a deterministic, injection-immune `scan-code-*` scanner) cleanly split from an advisory reachability judgment, with an honest P0 guarantee audit, a real P2 trust audit, and the ★ injection eval that the attempt-0 agenda cares about. The spec hash is un-drifted. The two concerns raised are **minor and additive**, not structural: (1) spell out that the two negative expecteds also carry a `semantic[]` judge to match the `skill_kind: llm` precedent; (2) name the first-occurrence / source-set-bound edge cases the scanner test should cover so the "first-match" discipline is actually pinned. Neither changes the plan's shape; both are refinements to fold in at `/pharn-dev-build`.

## Verdict

**ADVISORY VERDICT: 2 concerns raised (0 blocking-severity, 2 minor/advisory) — for the human to weigh before `/pharn-dev-build`.** This grill-log gates nothing: `/pharn-dev-grill` is advisory end-to-end (fix #3). The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift; unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`. "Produced a GRILL.md" never means "the plan is sound" (P0).
