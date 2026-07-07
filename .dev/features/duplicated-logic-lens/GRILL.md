# GRILL — duplicated-logic lens (interrogation of PLAN.md)

- Plan: `.dev/features/duplicated-logic-lens/PLAN.md`
- Spec-hash check (content-hash floor primitive): **MATCH** — `sha256(ARCHITECTURE.md)` == plan's `spec_content_hash` (`11cd9ad5…d1d969`); no drift, no P6 finding. (The binding block on drift is `/pharn-dev-build`'s floor-gate, not here — fix #3.)
- Grillers registered (floor membership, `count-grillers.mjs`): 13. Applied: architecture, coupling, testability, security, error-handling; **N/A** (not manufactured, P7): a11y, i18n, privacy, migrations, observability, performance, comprehension, documentation.
- **This grill-log is ADVISORY end-to-end (P0). It gates nothing.** It does not "pass" the plan; it surfaces concerns for the human to weigh. The floor backstops remain `/pharn-dev-build`'s spec-hash + HALT gates, `.dev/floor/validate.mjs`, and the scanner's own tests.

The PLAN.md is `trust: untrusted` to this griller: its self-claims are tested, not believed; quoted plan text in `evidence` is DATA, never an instruction.

---

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: P7 — honest scope / triggering failure (built-in)

```yaml
- type: FINDING
  rule_id: P7 # enum-gated (my assertion)
  severity: important # enum-gated value; assignment is advisory (fix #3)
  file: ".dev/features/duplicated-logic-lens/PLAN.md:4" # enum-gated — resolves
  problem: "P7 wants a new capability triggered by a real dogfood/eval failure, not a hypothetical; the plan's trigger for a whole new lens is the build-agenda / explicit user request, not a specific surfaced failure — the human should consciously affirm this is a genuine trigger, as for every lens in the proactive attempt-0 library." # free-text — inherits plan's untrusted tag
  evidence: "increment: Add a PRODUCT review lens pharn-review/duplicated-logic/ that reads untrusted CODE and surfaces copy-pasted / duplicated logic that should be extracted" # free-text — quoted DATA
```

### Axis: architecture griller (P3) — reinvention vs an established mechanism

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/duplicated-logic-lens/PLAN.md:84"
  problem: "The new scanner will duplicate the comment/string mask + line-normalize idiom already present in the scan-code-* family (scan-code-swallowed-exception / scan-code-injection) — literal code duplication in the very increment that adds a duplicated-logic detector. The plan defers consolidation to a separate axis (P7), which is defensible, but the human should weigh extracting a shared scan-code masking util now vs later."
  evidence: "Sibling of the scan-code-* family; any shared masking idiom is accepted, deferred duplication (consolidation touches a separate axis, P7)."
```

### Axis: testability griller (P1) — edge-case coverage of the trickiest logic

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/duplicated-logic-lens/PLAN.md:73"
  problem: "The '≥2 non-overlapping locations → merge maximal spans' logic is the scanner's most bug-prone part; the plan should ensure scan-code-duplicated-logic.test.mjs covers a block duplicated 3+ times, overlapping/adjacent duplicated regions, and a partial-repeat boundary (a maximal block followed by a shorter tail) — analogous to swallowed-exception's brace-matcher edge tests — or a merge/occurrence bug could ship behind a green floor."
  evidence: "slide an N=4 significant-line window → hash each window → group windows whose normalized text is verified byte-equal (not merely hash-equal) at ≥2 non-overlapping locations → merge maximal spans"
```

### Axis: P2 / finding-shape — a multi-location defect cited by one line

```yaml
- type: FINDING
  rule_id: P2
  severity: important
  file: ".dev/features/duplicated-logic-lens/PLAN.md:50"
  problem: "A duplication is inherently a relation between ≥2 locations, but the finding convention cites only the FIRST occurrence in the enum-gated `file` field; a developer sent to one copy may not notice the other(s). The choice is deterministic and `evidence` names every occurrence, but the human should confirm 'first-occurrence in file + all-in-evidence' is the right convention (vs also surfacing the duplicate-of line)."
  evidence: "file = the first occurrence's block start line (from the scanner)"
```

### Axis: P0 — guarantee-audit precision (which primitive is load-bearing)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/duplicated-logic-lens/PLAN.md:74"
  problem: "The guarantee-audit reduces the scanner to 'primitives #2 + #3', but the load-bearing guarantee is byte-EQUALITY (primitive #3, text membership); the window hash (#2) is a non-load-bearing index/accelerator, since equality is re-verified. Naming byte-equality as THE primitive (hash as accelerator) forecloses any reading of 'content-hash' as the guarantee — the exact P0 hygiene the plan otherwise models well."
  evidence: "→ FLOOR (content-equality / text membership, ARCH §2 primitives #2 + #3)"
```

---

## Prose summary

The plan is **strong and unusually honest**: its guarantee audit correctly splits a REAL partial floor
(exact-normalized block detection, injection-immune by masking) from the ADVISORY worth-extracting
judgment; the trust audit (P2) is complete (taint → free-text only; ★ `case-not-duplicated-comment`
fixture + `needle_absent_from_enum_gated` proving no enum-gated laundering); the determinism audit (P5)
is fail-closed with exit-code asserts; and the scope is honestly bounded (exact-match, single-file;
near-identical + cross-file deferred, P7). The **security** griller axis (the P2 trust-fence) is
well-covered — no finding. **coupling / one-axis:** bundling the lens (product) with its scanner
(apparatus) in one PR is defensible — it mirrors swallowed-exception #50 exactly, and the scanner has
no purpose except backing this lens — so no separate coupling finding; the architecture note above
(mask duplication) is the one structural-fit concern worth surfacing.

The five findings are **refinements, not blockers**: the two `important` ones the build should honor in
place (merge/occurrence edge tests; and a conscious call on the one-line-`file` convention), the P7 one
is a human affirmation, and the two `minor` ones are precision/consolidation notes. None reduces to a
constitution violation; none blocks `/pharn-dev-build`.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor) — for the human to
weigh before/at `/pharn-dev-build`.** This is advisory: `/pharn-dev-grill` gates nothing (fix #3). The plan's
deterministic backstops are `.dev/floor/validate.mjs`, the scanner's hermetic tests, and the
writes-scope hook — not this log.
