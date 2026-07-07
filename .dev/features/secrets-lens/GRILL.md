# GRILL — secrets-in-code lens (advisory interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/secrets-lens/PLAN.md` (`trust: untrusted` to this griller)
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` = `11cd9ad5…d1d969` **== plan `spec_content_hash`** → **no drift**. (The binding block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — not this stage.)
- **Security griller FLOOR sub-check:** `node .dev/floor/scan-plan-secrets.mjs PLAN.md` → `{"found":false,"hits":[]}` — the plan text carries **no** secret literal (it describes patterns, never embeds one). Clean.
- **Grillers discovered (deterministic membership, `count-grillers.mjs`):** 13 registered; applied inline (isolated runner deferred, P7). Relevant axes (security, testability, architecture, coupling, comprehension) interrogated below; the rest (a11y, i18n, migrations, observability, performance, privacy, error-handling, documentation) are **not applicable** to a markdown-only lens capability with no runtime / UI / DB / network / i18n surface — no finding fabricated (P7).

## Findings (finding-shape; enum-gated / free-text split honored)

### Axis: security + determinism (P0/P5)

```yaml
- type: FINDING
  rule_id: P5 # enum-gated — membership in the principle roster
  severity: minor # enum-gated value; ASSIGNMENT is advisory (fix #3) — grill gates nothing
  file: ".dev/features/secrets-lens/PLAN.md:31"
  problem: "The scanner is single-file (mirrors scan-plan-secrets.mjs's `<plan-file>` arg), but the lens `reads: <artifact-under-review>` — real code review is often multi-file; the plan does not state how the lens applies the single-file scanner across a multi-file code artifact (iterate files? one invocation per file?)."
  evidence: "`.dev/floor/scan-code-secrets.mjs` — deterministic secret-literal scanner over a CODE file"
```

### Axis: eval coverage / testability (P1)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/secrets-lens/PLAN.md:27"
  problem: "The env-var clean case expects `finding_count == 0`; under `skill_kind: llm` (eval-format.md) the `field_equals` / `file_resolves` kinds have no finding to range over. The plan should confirm the clean case's `expected` carries only `finding_count == 0` (structural) and whether any `semantic[]` judge (e.g. 'no false positive on process.env') is warranted or omitted."
  evidence: "`expected-env-var.json` — structural assertions (`finding_count == 0`)"
```

### Axis: architecture / one-axis-of-change (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/secrets-lens/PLAN.md:102"
  problem: "scan-code-secrets.mjs and scan-plan-secrets.mjs will carry an identical ~7-line PATTERNS regex set, so both files change when the pattern set changes — a real (small) coupling. Named + ratified at GATE-1 + consolidation deferred (P7, would touch the security griller = a separate axis). Surfaced here for the record, not a new objection."
  evidence: "~7-line `PATTERNS` regex set is **duplicated** across the two scanners"
```

### Axis: guarantee audit (P0)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/secrets-lens/PLAN.md:48"
  problem: "The hardcoded-key finding is planned as `severity: important` (mirroring the security griller), whereas the trust-fence lens uses `severity: blocking` for its P2 finding. This should be a deliberate choice, not drift — since a lens never gates, the assignment is advisory either way (fix #3); build should keep it consistent with the security-griller precedent it explicitly mirrors."
  evidence: "`severity important`, `file` = the literal's line (from the scanner)"
```

## Prose summary

The plan is **strong and floor-honest**: the guarantee audit reduces every claim to a floor primitive or an explicit `advisory` label, the "the code is secret-free" over-claim is explicitly struck (P0), the trust audit states taint propagation with a structural `needle_absent_from_enum_gated` proof (P2), and the new floor primitive is justified as the reduction of a real claim (P7). Spec-hash matches; the security scanner over the plan is clean.

Four **minor, advisory** concerns surfaced, none blocking:

1. **Multi-file application is unspecified (P5).** The single-file scanner is well-defined and the eval cases are single-file, so the _built_ increment is unambiguous — but how the lens applies the scanner to a multi-file code artifact in real use is not stated. Cheapest resolution: one line in the lens `.md` procedure ("apply the scanner per file in the artifact"), or explicitly scope v0.1.0 to single-file and name multi-file as a future increment (P7).
2. **Clean-case eval shape (P1).** Confirm `expected-env-var.json` uses only `finding_count == 0` and decide whether a `semantic[]` judge is needed for a zero-finding `skill_kind: llm` case.
3. **PATTERNS duplication (P3).** Already ratified and deferred; recorded for traceability.
4. **Severity choice (P0).** `important` vs trust-fence's `blocking` — confirm it's a deliberate mirror of the security griller, not an oversight (advisory either way, since a lens never gates).

None of these change the increment's shape; all are resolvable inside the approved `## Files` during `/pharn-dev-build` (a sentence or two in the lens `.md` / expected JSON), or explicitly deferred with a one-line note.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 minor/advisory) — for the human to weigh before /pharn-dev-build.** This is **not** "grill passed" and **not** a guarantee the plan is sound (P0): `/pharn-dev-grill` gates nothing. The only floor-grade facts in this run are the content-hash match (no spec drift) and the deterministic scan (plan carries no secret literal); everything else here is model judgment, surfaced for the human.
