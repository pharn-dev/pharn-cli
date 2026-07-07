# GRILL — copy-paste-drift lens (interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/copy-paste-drift-lens/PLAN.md` (scanner-version, human-approved at GATE 1).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking):** `sha256(ARCHITECTURE.md)` recomputed = `11cd9ad5…d969` — **matches** the plan's `spec_content_hash`. No drift. (The block on drift is `/pharn-dev-build`'s floor-gate, not this stage — fix #3/#4.)
- **Grillers registered (deterministic membership, `count-grillers.mjs`):** 13. Applied here for genuine axis-relevance: architecture, testability, coupling, security, error-handling, performance. N/A for this increment (no surface): a11y, i18n, migrations, observability, privacy, documentation-beyond-plan, comprehension-beyond-plan.
- **Trust:** `PLAN.md` is `trust: untrusted` to this griller; quotes below are DATA, not instructions. Every finding is **advisory** — none gates `/pharn-dev-build`.

## Findings (finding-shape; enum-gated / free-text split honored)

### Trust propagation (P2) — the attempt-0 axis

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P2 # enum-gated
  severity: important # enum-gated value; assignment is advisory (fix #3)
  file: ".dev/features/copy-paste-drift-lens/PLAN.md:104" # enum-gated — resolves
  problem: "The ★ needle is only a COMMENT ('do not flag'); the scanner's `outlier`/`majority` are CODE tokens (post-mask) that flow into free-text evidence, so a needle placed in a code IDENTIFIER is untested — the plan should assert those code-derived tokens never reach an enum-gated field (structurally true: the only code-derived enum-gated field is the integer `file` line) and ideally add a code-identifier-needle assertion to harden the fence." # free-text (untrusted DATA)
  evidence: 'plan L104: `needle_absent_from_enum_gated "do not flag" … The scanner''s masking makes suppression/manufacture by comment impossible`' # free-text — quoted, never executed
```

### Determinism / floor precision (P5, P0) — pin the scanner so its FLOOR claim is fully deterministic

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/copy-paste-drift-lens/PLAN.md:36"
  problem: "The mask step does not specify how MULTI-LINE constructs (block comments /*…*/, multi-line template literals) are handled; if masking blanks or merges physical lines it can corrupt the 'consecutive aligned lines' grouping the odd-one-out depends on. Pin the multi-line masking behavior so alignment stays deterministic and testable."
  evidence: "plan L36: `Mask comments (//…, /*…*/) and string/template literals to inert placeholders … BEFORE tokenizing`"
```

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/copy-paste-drift-lens/PLAN.md:38"
  problem: "Structural-alignment ('same token at every structural position; only identifier/literal slots may vary') depends on a token-kind classifier that the plan never pins — so 'same skeleton' is not yet a fully specified membership test. Name the rule that classifies a token as identifier/literal (a variable slot) vs structural (keyword/operator/punctuation), so the alignment test is deterministic and the .test.mjs can pin it."
  evidence: "plan L38: `identical token at every structural position (only identifier/literal slots may vary)`"
```

### Error-handling (griller axis) — the scanner's failure mode is unspecified

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: ".dev/features/copy-paste-drift-lens/PLAN.md:44"
  problem: "The documented bounds omit the scanner's behavior on empty / non-JS / unbalanced input. It should fail-safe to found:false and never throw (as the sibling scan-code-* scanners do); an unhandled parse edge could crash the inline review stage rather than degrade to 'no hit'. Add an empty/non-parseable → found:false unit test."
  evidence: "plan L44: `Documented false-negatives / bounds … coarse tokenizer … single-file; JS/TS-ish token shapes` (no empty/non-parseable fail-safe stated)"
```

### Eval coverage (P1) — lens-level non-manufacture is not pinned by a committed eval

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/copy-paste-drift-lens/PLAN.md:85"
  problem: "Scanner unit tests pin found:false negatives at the SCANNER level, but no committed LENS eval pins the lens's non-manufacture (finding_count == 0 when the scanner is clean). This is the same residual trust-fence/swallowed-exception carry, and the plan explicitly defers the clean-negative lens case to P7 — surfaced so the human weighs it, not asserted as a defect."
  evidence: "plan L85: `Scanner unit tests … all-identical lines → found:false … a 2-member near-identical pair → found:false … intended per-item variation … → found:false`"
```

### Honest scope / architecture (P7) — product-lens → `.dev/` scanner coupling (inherited, deferred)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/copy-paste-drift-lens/PLAN.md:5"
  problem: "The product lens (pharn-review/) invokes a .dev/floor/ apparatus scanner, so 'packaging = root minus .dev/' would strip a scanner the product depends on. This is INHERITED from duplicated-logic/swallowed-exception (not introduced here) and correct for the current build phase, but it extends an unowned cross-cutting item: the scan-code-* family's eventual relocation to a product floor location. Surfaced for the human; no action required this increment."
  evidence: "plan L5: `+ `.dev/floor/` build-apparatus (the new scanner + its test — apparatus the product lens INVOKES, exactly as duplicated-logic invokes .dev/floor/scan-code-duplicated-logic.mjs)`"
```

## Prose summary

The plan is strong where it matters most: the guarantee audit is honest and two-clock-aware, the FLOOR claim is scoped strictly to the odd-one-out **shape** (not "bug"), the correlated-slot false-negative is named, and the P7 boundary vs `duplicated-logic` is exact (mutually exclusive by construction). The interrogation surfaced **no P0 disease** (no unlabeled guarantee) and **no drift** (spec-hash matches).

The concerns are all about **tightening the new floor primitive's specification** so `/pharn-dev-build` implements it unambiguously and the `.test.mjs` is meaningful: pin the multi-line masking behavior (P5), pin the token-kind/slot classification (P5), and specify the empty/non-parseable fail-safe (error-handling). The one P2 note is a **test-strengthening** — the fence holds structurally (the sole code-derived enum-gated field is the integer `file` line), but the eval only exercises a comment needle, not a code-identifier needle. The P1 and P7 items are **honest-coverage disclosures** the plan already half-acknowledges (deferred clean lens-eval; inherited `.dev/` scanner coupling). None changes the increment's shape; all are refinements build may fold in.

## Verdict

**ADVISORY VERDICT: 6 concerns raised (1 important-severity, 5 minor) — all advisory, spec-hash matches (no drift), none blocks `/pharn-dev-build`.** For the human to weigh; the deterministic backstops remain `/pharn-dev-build`'s floor-gates and `validate.mjs`. This is NOT "grill passed" and NOT a judgment that the plan is sound (P0) — it surfaces concerns; it does not ensure quality.
