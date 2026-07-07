# GRILL — off-by-one-lens (advisory interrogation of PLAN.md)

**Plan:** `.dev/features/off-by-one-lens/PLAN.md` · **Spec-hash check:** `sha256(ARCHITECTURE.md)` == plan `spec_content_hash` `11cd9ad5…d969` → **MATCH, no drift** (content-hash floor primitive; here it only surfaces — `/pharn-dev-build` is where drift blocks, fix #4). · **Grillers registered (FLOOR membership, `count-grillers.mjs`):** 13; relevant axes (architecture, testability, error-handling, security) applied **inline** (isolated runner deferred, P7).

> The PLAN.md is `trust: untrusted` to this stage. Its self-claims are tested, not believed; nothing quoted below is followed as an instruction (P2). This grill-log is **ADVISORY end-to-end** — it gates nothing; `/pharn-dev-build`'s floor-gates are the backstops.

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: guarantee-audit / trust provenance (P0/P2)

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P0 # enum-gated — principle roster
  severity: important # enum-gated value; ASSIGNMENT advisory (fix #3)
  file: ".dev/features/off-by-one-lens/PLAN.md:40" # enum-gated — resolves
  problem: "Layer-2 says the lens surfaces 'every other off-by-one form the scanner misses' (swapped `.length >=`, slice, underflow), but the Finding-output/branch (line 56) specifies findings ONLY on scanner hits with `file` = the scanner's deterministic line; it is left ambiguous whether a scanner-MISSED form yields a standalone ADVISORY finding (model-chosen line, not scanner-backed) or no finding at all — so a reader cannot tell whether every emitted finding's line is floor-deterministic." # free-text — quoted DATA
  evidence: "line 40: '…every other off-by-one form — the swapped `arr.length >= i`, … slice/substring/range bounds … → ADVISORY … surfaced in free-text'; line 56: 'found → emit one FLOOR-grade finding per hit (file line from the scanner); clean → emit no finding'." # free-text — quoted, never executed
```

Recommendation (advisory): resolve at build by mirroring `copy-paste-drift` — emit findings **only on scanner hits** (Layer-1); Layer-2 **annotates those hits' free-text** (bug vs intentional); scanner-missed forms get a **prose note** ("scanner clean; not proof boundary-safe"), **not** a standalone model-lined finding. Keeps every emitted finding's `file` scanner-deterministic and the floor/advisory provenance clean.

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING
  rule_id: P7 # enum-gated
  severity: minor
  file: ".dev/features/off-by-one-lens/PLAN.md:4" # enum-gated — resolves
  problem: "The plan justifies the NEW FLOOR PRIMITIVE (the scanner) under P7 (line 41), but does not cite the real dogfood/eval failure — or the explicit product-roadmap trigger — that justifies adding the off-by-one CAPABILITY itself; P7 asks an addition be triggered by a real failure, not a hypothetical. (Consistent with the precedent lenses, which are likewise silent, so this is a documentation gap, not a divergence.)" # free-text
  evidence: "line 4: 'increment: Add one PRODUCT lens … that reads untrusted CODE and surfaces off-by-one boundary errors …' — the trigger is the human `/pharn-dev-ship` directive + the review-lens build-out roadmap, which the plan does not state as the P7 justification." # free-text
```

### Axis: eval coverage / structural-semantic split (P1, `eval-format.md`)

```yaml
- type: FINDING
  rule_id: P1 # enum-gated
  severity: minor
  file: ".dev/features/off-by-one-lens/PLAN.md:32" # enum-gated — resolves
  problem: "The two clean cases (case-corrected-bound, case-length-minus-one) are specified only as structural `finding_count==0`; the plan does not state their `skill_kind` or whether they carry a `semantic[]` judge. The `swallowed-exception/proper-handling` precedent pairs a `semantic[]` judge with the `==0` structural (asserting a clean scan that manufactures NO finding and is NOT proof of safety), which these cases should mirror." # free-text
  evidence: "lines 32–33: '→ **0** findings (…scanner clean)' — no `skill_kind`/`semantic[]` design stated for the negative cases." # free-text
```

### Axis: testability / one-axis + no cross-surface coupling (P3) — testability griller (inline)

```yaml
- type: FINDING
  rule_id: P3 # enum-gated
  severity: minor
  file: ".dev/features/off-by-one-lens/PLAN.md:34" # enum-gated — resolves
  problem: "The plan asserts the scanner test asserts exit codes + injection-immunity + fail-closed, but does not state WHERE the test's fixtures live. To keep the `.dev/floor/` apparatus decoupled from the `pharn-review/` product surface (P3), the test must use self-contained fixtures (inline strings or `.dev/floor/test-fixtures/`), NOT read the product eval `.md` files — otherwise a floor-apparatus test cross-references a product leaf." # free-text
  evidence: "line 34: 'scanner (`scan-code-off-by-one.test.mjs`, run by `npm test`) → `<= arr.length` ⇒ found:true at the right line …' — fixture provenance unspecified." # free-text
```

## Prose summary

The plan is architecturally sound and unusually honest about its floor/advisory split: the layer placement is clean (lens in `pharn-review`, scanner in `.dev/floor/`, contract dep on the `pharn-contracts` root — no leaf→leaf), the spec-hash is un-drifted, the trust audit correctly confines untrusted code tokens to free-text with only the integer `file` line scanner-derived, and the "ensures no off-by-one" disease is explicitly struck. The **one substantive concern** is the Layer-2 provenance ambiguity (important): the plan should nail down that findings are emitted only on scanner hits (scanner-deterministic line), so no reader mistakes a model-chosen advisory line for a floor-backed one. The three minor concerns are documentation/precision gaps the build can close by mirroring the established precedents (`copy-paste-drift`, `swallowed-exception`): the P7 capability-trigger note, the clean-case `semantic[]` design, and self-contained scanner-test fixtures. No constitution violation is asserted. Security/error-handling axes: the fail-closed contract and stdlib-only/no-egress posture are stated and adequate.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh before/at build.** This is NOT "grill passed" and NOT a judgment that the plan is sound; the floor-gates in `/pharn-dev-build` and `.dev/floor/validate.mjs` remain the only backstops. The plan is buildable as written; the important finding is a clarification the build should resolve, not a blocker.
