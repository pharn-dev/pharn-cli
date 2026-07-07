# GRILL — input-validation lens (advisory)

Plan interrogated: `.dev/features/input-validation-lens/PLAN.md`.
Spec-hash check (content-hash floor primitive, surfaced not blocking): `sha256(ARCHITECTURE.md)` = `11cd9ad5…d969` **== plan `spec_content_hash`** → **no drift**. (The block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — not here.)
Grillers registered (live, `count-grillers.mjs`): **13**. Applied the relevant axes inline (architecture, coupling, comprehension, testability, security, documentation); the application-domain axes (a11y, i18n, migrations, observability, performance, privacy, error-handling) produce **no findings** on a methodology-lens plan (not applicable to markdown-capability code).

> The `PLAN.md` is `trust: untrusted` to this griller. Free-text `problem`/`evidence` quote the plan as DATA; the enum-gated fields are my own membership/path assertions.

## Findings (grouped by axis; the enum-gated / free-text split honored)

### Eval coverage + structural/semantic split (P1, `eval-format.md`)

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/input-validation-lens/PLAN.md:31"
  problem: "The clean-case `finding_count == 0` is NOT scanner-backed for an advisory-only lens, so a clean verdict rests on model judgment (variance-prone), unlike injection's deterministic scanner-clean case."
  evidence: "`case-validated` → input validated/bounded before the sink → **0** findings"
```

```yaml
- type: FINDING
  rule_id: P1
  severity: important
  file: ".dev/features/input-validation-lens/PLAN.md:28"
  problem: "The 'Evals to write' section does not state `skill_kind: llm` nor that the advisory validation-adequacy verdict belongs in `semantic[]` — risk of laundering an advisory judgment into structural-only (eval-format.md forbids the reverse and treats the split as load-bearing)."
  evidence: "## Evals to write (P1)"
```

### Guarantee-audit honesty (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/input-validation-lens/PLAN.md:40"
  problem: "'floor-CHECKED at eval time' omits the finding-shape.md §Emission caveat that the AUTOMATED runner over emitted findings.json is increment 3c (not yet wired); today the trip-wire is realized only when check-structural is run against a committed expected+actual (e.g. at /pharn-dev-verify). Matches injection's accepted framing, but the 3c caveat should be carried."
  evidence: "is floor-CHECKED at **eval time** by `.dev/floor/check-structural.mjs`"
```

### Honest scope / no speculation (P7) + domain overlap (P4/architecture)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/input-validation-lens/PLAN.md:57"
  problem: "No cited dogfood/eval failure triggers this addition — P7 requires a real failure, not a hypothetical. The trigger is human direction via /pharn-dev-ship (acknowledged at GATE 1: 'plan approved'). Surfaced for the record; the human owns this call."
  evidence: "There is **no cited dogfood/eval failure** motivating it — it is a **human-directed** addition via `/pharn-dev-ship`."
```

```yaml
- type: FINDING
  rule_id: P4
  severity: minor
  file: ".dev/features/input-validation-lens/PLAN.md:57"
  problem: "Detection domain overlaps the injection lens (both enforce P2 over code): the concat-into-sink case is injection's scanner; this lens's distinctive ground is the advisory bare-input-into-sink judgment. Not a P3 sibling-import nor a P4 rule-restatement, but the redundancy is worth the human weighing vs. distinct value."
  evidence: "This lens overlaps the existing `injection` lens (the concat-into-sink case) and the plan-time `security` griller"
```

## Prose summary

The plan is **well-formed, honest, and minimal**. Its guarantee audit correctly refuses to manufacture a floor (the strongest thing here), its trust audit is thorough (taint → free-text only; `file` = sink line; the ★ needle trip-wire), and it correctly defers the deterministic scanner to a separate increment (one axis, one PR).

The concerns are **refinements, not blockers**:

1. **Eval robustness (important).** For an advisory-only lens the clean-case `0 findings` is judgment, not a scanner verdict — the build should encode the eval as `skill_kind: llm` with the advisory validation-adequacy in `semantic[]`, and treat the clean case as advisory-variance-prone (unlike injection's scanner-clean case). This is the one thing most worth folding into the build.
2. **P0 honesty (minor).** Carry the finding-shape.md "3c runner not yet wired" caveat on the eval-time trip-wire claim.
3. **P7 trigger (important, already surfaced).** The addition is human-directed, not failure-triggered — accepted by the human at GATE 1.
4. **Overlap with `injection` (minor, already surfaced).** Distinct advisory ground exists; redundancy is the human's to weigh.

None of these reduce to a floor stop, and the spec hash is un-drifted, so nothing here blocks `/pharn-dev-build`.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 3 important, 2 minor) — for the human to weigh before/at build.** This is **not** "grill passed" and **not** a guarantee the plan is sound; `/pharn-dev-grill` gates nothing. The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift, open-questions) and `.dev/floor/validate.mjs`.
