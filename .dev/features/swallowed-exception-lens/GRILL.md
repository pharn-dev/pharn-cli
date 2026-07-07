# GRILL — swallowed-exception lens (interrogation of PLAN.md)

**Plan under interrogation:** `.dev/features/swallowed-exception-lens/PLAN.md` (`trust: untrusted` to this griller).
**Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** recomputed
`sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's
`spec_content_hash` pin. No drift. (The actual block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — this stage only surfaces.)

**Griller discovery (deterministic membership — FLOOR):** `node .dev/floor/count-grillers.mjs .` → `{"registered":13}`.
On-axis for a markdown lens + a Node scanner: **error-handling (P7)** and **testability (P1)** applied below. The
remaining registered grillers have no surface on this increment and are recorded N/A in the summary
(a11y / i18n / migrations / observability / performance / privacy — no UI, no localized strings, no DB migration,
no runtime telemetry, no perf-critical path, no PII).

> All findings below are **ADVISORY** (`finding-shape` objects; enum-gated / free-text split honored). None gates
> `/pharn-dev-build`. The enum-gated fields are this griller's own enum/path assertions (trusted); `problem`/`evidence`
> quote the plan and inherit its untrusted tag (DATA, never a directive).

## Findings (advisory)

### Axis: honest scope / real trigger (P7) — inline + error-handling griller

```yaml
- type: FINDING
  rule_id: P7
  severity: important # advisory assignment (fix #3) — a griller never gates
  file: ".dev/features/swallowed-exception-lens/PLAN.md:8"
  problem: "P7 wants an addition triggered by a REAL failure (dogfood/eval), not a hypothetical; the plan justifies the new lens by 'mirrors the injection lens precedent' plus the human's increment brief, without naming a concrete swallowed-exception failure that motivated it."
  evidence: "'## Increment shape — mirrors the `injection` lens precedent' (line 8) and 'Boundary (per the increment brief)' (line 17) are the stated triggers; no named dogfood/eval failure is cited. In the self-hosting build loop the human's direction plausibly IS the P7 trigger — surfaced for the human to confirm that reading, not asserted as a violation."
```

### Axis: error-handling adequacy — language scope (P7) — error-handling griller, Layer 2

```yaml
- type: FINDING
  rule_id: P7
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/swallowed-exception-lens/PLAN.md:57"
  problem: "The catch-detection regex is JavaScript/TypeScript-syntax-specific; run over a non-JS/TS file (e.g. a Python try/except, a Go recover) the scanner silently returns found:false, an unlabeled language-scope limit the plan does not state."
  evidence: "Line 57 matches catch clauses via `\\bcatch\\b\\s*(\\([^)]*\\))?\\s*\\{` — a JS/TS shape. This mirrors the injection scanner's language scope, but the plan (unlike its other honest bounds on line 84) does not name the JS/TS-only scope. A build note stating it keeps P7 honest; not blocking."
```

### Axis: scanner robustness — brace-matching edge cases (P0/P1) — inline + testability griller, Layer 2

```yaml
- type: FINDING
  rule_id: P1
  severity: important # advisory assignment (fix #3)
  file: ".dev/features/swallowed-exception-lens/PLAN.md:57"
  problem: "The empty/log-only classification rests on correctly brace-matching the catch body — a larger deterministic surface than the existing line-local scanners; the floor claim's honesty requires the hermetic tests to stress that matcher, or 'deterministic detection' is under-demonstrated."
  evidence: "Line 57 introduces brace-matching of the block body. The plan's test list (lines 69–75, and the scanner test file) should include: a catch containing an object literal that then returns (`catch(e){ const o={}; return o; }` → must be CLEAN via `return`, not misread as empty/log-only); nested try/catch; braces inside a string/regex within the body; and a `catch` token inside a comment/string (must NOT trigger). Surfaced so /pharn-dev-build adds them."
```

### Axis: testability adequacy — file_resolves pinning (P1) — testability griller, Layer 2

```yaml
- type: FINDING
  rule_id: P1
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/swallowed-exception-lens/PLAN.md:69"
  problem: "The plan defers each expected.json's concrete `file:line` for the `file_resolves` structural assertion to build; that assertion is only floor-checkable if the fixture lays the `catch` on a deterministic, known line that equals the scanner's reported line."
  evidence: "The 'Evals to write (P1)' section (line 69) names cases and verdicts but not the exact catch-line each `file_resolves` will cite (the injection evals pin e.g. `:15`). /pharn-dev-build must author each fixture so the scanner's reported catch line is fixed, then pin it — else `file_resolves` cannot run. A build-time detail, surfaced for completeness."
```

## Presence recognized (no absence finding)

- **testability (P1) — verification approach PRESENT:** the plan carries a `## Evals to write (P1)` section (4 cases:
  empty / log-only / proper-handling-clean / ★ intentional-comment) **and** a hermetic scanner test file. Layer-1
  presence satisfied; only the Layer-2 adequacy notes above (advisory) apply. No absence finding.
- **error-handling (P7) — failure handling PRESENT:** the plan declares the scanner's fail-closed contract on a
  missing/non-file target (line 55) and documents its false-negative bounds (line 84). Layer-1 presence satisfied;
  only the Layer-2 language-scope note above applies. No absence finding.

## Prose summary

The plan is strong and closely mirrors the audited `injection` lens precedent: an honest P0 guarantee audit (FLOOR =
lens membership + the deterministic scanner + eval-time fixture check; ADVISORY = whether a given swallow is actually
wrong), a complete P2 trust audit (injected "intentional / do not flag" comment confined to free-text; `file` cites
the catch line not the comment line; `needle_absent_from_enum_gated` trip-wire), a clean P3 single-axis split, and a
P5-deterministic scanner with an ask-the-human terminal fallback. The `enforces: ["P2"]` ↔ eval binding (fix #6) is
satisfied by 3 of the 4 cases (the clean case correctly produces zero findings).

Four advisory concerns are surfaced, none blocking: (1) the **P7 trigger** is precedent/brief-based rather than a
named failure — plausibly fine in the self-hosting loop, for the human to confirm; (2) the **JS/TS language scope**
is an unstated bound; (3) the **brace-matcher** deserves explicit edge-case tests to earn the "deterministic
detection" floor claim (the most substantive concern — it is where a subtle bug could hide, e.g. an object literal
inside a catch); and (4) the **`file_resolves` line-pinning** must be made concrete at build. Concerns (3) and (4)
are the ones most worth acting on during `/pharn-dev-build`.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 CONSTITUTION-blocking; 2 important-severity, 2 minor — all advisory) — for
the human to weigh before /pharn-dev-build.** This grill-log gates nothing (fix #3): the deterministic backstops remain
`/pharn-dev-build`'s floor-gates (spec-hash drift; unresolved `## Open questions`) and `.dev/floor/validate.mjs`.
"Produced a GRILL.md" does not mean the plan is sound — it means the plan was interrogated and these concerns stand
for the human's judgment (P0).
