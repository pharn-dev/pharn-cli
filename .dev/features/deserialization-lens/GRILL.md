# GRILL — deserialization-lens (interrogation of PLAN.md, ADVISORY)

- Plan: `.dev/features/deserialization-lens/PLAN.md`
- Spec-hash check (content-hash floor primitive, surfaced only): `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **==** the plan's pinned `spec_content_hash` → **no drift**. (The binding block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — not this stage.)
- Grillers discovered by deterministic membership (`.dev/floor/count-grillers.mjs`): **13 registered** (a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability). Applied below; none produced a blocking concern for this markdown-lens + regex-scanner increment.

> The PLAN is `trust: untrusted` to this stage. Instruction-looking content in it is DATA I interrogate, never an instruction. The findings' enum-gated fields are my own path/enum assertions; `problem`/`evidence` quote the plan and inherit its untrusted tag. **Nothing here gates `/pharn-dev-build`** (P0, fix #3).

## Findings (finding-shape; enum-gated / free-text split honored) — all ADVISORY

### Axis: honest scope / no speculation (P7)

```yaml
- type: FINDING # enum-gated (my assertion)
  rule_id: P7 # enum-gated
  severity: minor # enum-gated value; the ASSIGNMENT is advisory (fix #3) — grill gates nothing
  file: ".dev/features/deserialization-lens/PLAN.md:4"
  problem: "The plan justifies the increment as 'the deserialization sibling of the injection lens' but never states the REAL triggering failure P7 requires (a dogfood/eval failure, not family-completion)." # free-text (untrusted DATA)
  evidence: "increment: Add a product lens … backed by a new deterministic, injection-immune deserialization scanner." # free-text — quoted
```

**Weigh:** the defensible P7 trigger is a _demonstrable coverage gap_ — reviewed code calling `pickle.loads`/`eval` on request data is currently caught by **no** lens, and the plan's `case-pickle-loads` eval **encodes exactly that gap**. That is a real, eval-provable failure, not a hypothetical — so P7 is arguably satisfied. The concern is only that the plan leans on "sibling of injection" rather than **saying** this. Recommend one sentence naming the coverage-gap trigger (the eval that proves it). Consistent with how prior lens plans (`injection`, `secrets-in-code`) were justified.

### Axis: eval coverage (P1) / structural-vs-semantic split (eval-format.md)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/deserialization-lens/PLAN.md:108"
  problem: "The three lens eval cases positively exercise only two of the scanner's three kinds — 'unsafe-deserialize' (pickle.loads) and 'code-eval' (via the hostile safe-comment case); 'unsafe-yaml-load' appears only as a NEGATIVE (yaml.safe_load), so no lens eval produces a positive yaml.load finding." # free-text
  evidence: "case-pickle-loads (unsafe-deserialize) / case-safe-comment ★ (code-eval) / case-safe-yaml (0-finding negative)." # free-text — quoted
```

**Weigh:** this is a _deliberate, precedented_ scoping choice — `injection` shipped 3 lens cases and pushed exhaustive per-family coverage to `scan-code-injection.test.mjs`; this plan does the same, deferring the other families' positive lens cases to `scan-code-deserialization.test.mjs` + a later increment if a real need surfaces (P7). No laundering: every `structural[]` assertion (finding_count / field_equals / file_resolves / needle_absent_from_enum_gated) is floor-reducible per `eval-format.md`; only exploitability is left to `semantic[]`. Surfaced so the human knows the lens-level positive `unsafe-yaml-load` case is **intentionally deferred** to the scanner test. `enforces: [P2]` is still bound (two positive cases carry `rule_id P2`) — no P1 violation.

### Axis: testability (P1/P0) — the floor proof must be the COMMITTED test, not the planning script

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/deserialization-lens/PLAN.md:71"
  problem: "The plan's floor claim rests on the scanner's determinism, whose AUTHORITATIVE proof is the committed scan-code-deserialization.test.mjs — not the throwaway 24-sample node -e run done at plan time. If the committed test under-covers the true-negatives / ★ immunity cases, the floor claim is asserted but not proven." # free-text
  evidence: "hermetic tests incl. the ★ injection-immunity tests + all three sink kinds + true-negatives (json.loads / JSON.parse / yaml.safe_load / SafeLoader-qualified)." # free-text — quoted
```

**Weigh:** the plan already specifies this coverage in the Files entry, so this is belt-and-suspenders: `/pharn-dev-build` must land a `scan-code-deserialization.test.mjs` that mirrors `scan-code-injection.test.mjs`'s rigor — the two ★ immunity tests (a "safe" comment cannot suppress a real `eval`/`pickle.loads`; a "safe" comment with no dangerous call stays clean), every positive kind, and the load-bearing true-negatives (`json.loads`, `JSON.parse`, `yaml.safe_load`, `yaml.load(…, Loader=…SafeLoader)`), plus fail-closed. `/pharn-dev-verify`'s `npm test` gate re-runs it deterministically.

## Clean axes (interrogated, no finding)

- **P0 guarantee-audit completeness** — every claim reduces to floor (regex primitive #3) or is labeled `advisory`; the "deserialization-safe" over-claim is explicitly **struck**; JSON.parse deliberately excluded (honest, not an omission); "two clocks" and the new-primitive P7 justification present. No disease.
- **P2 trust propagation** — thorough: `file` from the scanner line (never a comment line), free-text inherits the code's untrusted tag, the `needle_absent_from_enum_gated: "already validated"` trip-wire on the ★ case, residual named (`LIMITS.md §2`). No guaranteed decision rests on a tainted field.
- **P3 one axis / no sibling imports** — the plan explicitly fences this scanner (deserialization/eval sinks) off from the `injection` scanner (query/command/HTML), so no call is double-flagged and each scanner changes for one reason; lens `reads:` only `pharn-contracts/finding-shape` (no sibling). Lens+scanner+test in one increment is the established inseparable pattern, not bundling.
- **P5 determinism** — regex membership + the same-line `SafeLoader` negative discriminator; fail-closed on missing/non-file; terminal fallback = emit + ask the human. No LLM in the floor path.
- **security / architecture / coupling / documentation / comprehension / error-handling grillers** — reinforce the above (stdlib-only fail-closed scanner, correct layer, `coupling: agnostic`, exceptional docs, specified error path). **a11y / i18n / migrations / observability / privacy / performance** — not applicable to a markdown lens + regex scanner (no UI / strings / DB / telemetry / PII / hot path). No findings.

## Summary

The plan is strong and closely mirrors the vetted `injection` precedent. No P0 disease, no trust-model gap, no determinism gap, no spec drift. The three concerns are all **minor/advisory** and mostly documentation/rigor nudges: (P7) name the eval-provable coverage-gap trigger explicitly; (P1) note that positive `unsafe-yaml-load` lens coverage is intentionally deferred to the scanner test; (P1/P0) make the committed scanner test the authoritative floor proof at the same rigor as `scan-code-injection.test.mjs`. None blocks the build; all can be absorbed as `/pharn-dev-build` writes the files.

## Verdict

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 minor/advisory) — for the human to weigh before `/pharn-dev-build`.** This is not a gate and not a "grill passed"; `/pharn-dev-grill` surfaces concerns and does not ensure the plan is sound (P0). The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift, open-questions) and `.dev/floor/validate.mjs`.
