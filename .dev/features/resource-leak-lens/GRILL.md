# GRILL — resource-leak-lens (advisory interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/resource-leak-lens/PLAN.md` (treated as `trust: untrusted` DATA — P2).
- **Spec-hash check (content-hash floor primitive; surfaced, not blocking here):** recomputed `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's pinned `spec_content_hash`. **No drift.** (The actual block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — this only surfaces it.)
- **Grillers registered (deterministic membership, `count-grillers.mjs .`):** 13 — `a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability`. (The command's inline "only testability" text is stale; the live count governs — P6.) Applied faithfully by reading their procedure: **testability**, **error-handling**. Applied by their axis (clean, no read needed for a verdict): **architecture, coupling, comprehension, documentation, security**. **N/A** to a methodology-markdown-lens + JS-scanner increment (no user-facing UI / locale / schema / PII / service telemetry / hot path): **a11y, i18n, migrations, privacy, observability, performance** — no findings.

## Findings (advisory — none blocking; grillers gate nothing, fix #3)

All findings are `severity` **minor** and **advisory**: the plan faithfully mirrors the proven `scan-code-*` sibling pattern (null-deref detection shape; swallowed-exception lens/eval/test shape). These sharpen the scanner's documented bounds and de-risk `/pharn-dev-build`; none is a gate.

### Axis: comprehension / P0-precision

```yaml
- type: FINDING # enum-gated (TRUSTED)
  rule_id: P0 # enum-gated — cited (P4)
  severity: minor # enum-gated value; ASSIGNMENT advisory (fix #3) — a griller never gates
  file: ".dev/features/resource-leak-lens/PLAN.md:4" # enum-gated — resolves
  problem: "The increment description says cleanup absence is judged 'in scope', but the implemented floor claim is file-level and name-tracked (no NAME.close( anywhere after the binding in THIS file), not lexical block/function scope." # free-text — DATA
  evidence: "Line 4: '…whose binding is never closed (no cleanup call, no using, no close-in-finally)…'. The guarantee-audit (line 90+) states the precise 'in this file' claim, so the plan is honest — but the word 'scope' risks implying control-flow/function-scope analysis that is explicitly disclaimed (line 70)." # free-text — quoted DATA
```

Advisory ask: have the lens `.md` + scanner header use the null-deref-style precise wording — _"no cleanup of NAME in this file, after the binding"_ — and avoid the bare word "scope," so no reader mistakes a file-level name-track for scope analysis.

### Axis: error-handling / P7

```yaml
- type: FINDING # enum-gated (TRUSTED)
  rule_id: P7 # enum-gated — cited (P4)
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/resource-leak-lens/PLAN.md:66" # enum-gated — resolves
  problem: "A bare `finally` is NOT treated as cleanup; only a detected close CALL on the binding counts — so a try/finally whose finally does not close the binding (empty finally, or closes a different object) still FLAGS the open. Correct behavior, but not in the documented bounds, and it constrains the try-finally fixture." # free-text — DATA
  evidence: "Lines 66–67 detect cleanup via `NAME.close(`/arg-form only; there is no bare-`finally` rule. Consequence: `case-try-finally-close` (line 37) MUST place an actual `handle.close()` INSIDE the finally, or it will (correctly) flag." # free-text — quoted DATA
```

Advisory ask: add to the scanner's `## Honest bounds` (line 70) that _a `finally` block is not itself cleanup — the close call must be present and on the binding_; and ensure `/pharn-dev-build` writes `case-try-finally-close` with a real `handle.close()` in the finally.

### Axis: testability / P0 (false-CLEAN direction of the argument-form match)

```yaml
- type: FINDING # enum-gated (TRUSTED)
  rule_id: P0 # enum-gated — cited (P4)
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/resource-leak-lens/PLAN.md:67" # enum-gated — resolves
  problem: "The argument-form cleanup regex `(close|end|destroy|…)\\([^)]*\\bNAME\\b` matches NAME anywhere inside a close-family call's args, so it false-CLEANs when NAME merely appears as a NON-target argument (e.g. `end(wrap(fd))` reads fd, does not close it) — a false-negative, undocumented." # free-text — DATA
  evidence: "Line 67 arg-form alternation. The direction is conservative (toward CLEAN / under-flagging), acceptable for an advisory lens, but should be named in the bounds like null-deref names its non-scope-aware bounds." # free-text — quoted DATA
```

Advisory ask: add the arg-form false-CLEAN case to `## Honest bounds` (line 70). No behavior change needed — just disclose it (P0 honesty).

### Axis: testability / P1 (clean-case expected conformance)

```yaml
- type: FINDING # enum-gated (TRUSTED)
  rule_id: P1 # enum-gated — cited (P4)
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/resource-leak-lens/PLAN.md:38" # enum-gated — resolves
  problem: "The two 0-finding expecteds (try-finally-close, using-declaration) are skill_kind: llm with finding_count == 0; the plan should pin their structural[]/semantic[] shape so they are well-formed llm expecteds (not an accidental deterministic-with-forbidden-semantic, nor an ill-formed llm case)." # free-text — DATA
  evidence: "Lines 38 & 40. eval-format.md forbids semantic[] under a `deterministic` skill and expects both classes under `llm`; a clean (0-finding) llm case is unusual and should mirror an existing precedent." # free-text — quoted DATA
```

Advisory ask: have `/pharn-dev-build` mirror `swallowed-exception`'s existing clean-case expected (`evals/expected/expected-proper-handling.{json,md}`) for both 0-finding cases, so their `skill_kind`/`assertions` shape is copied from a passing precedent, not invented.

### Axis: testability / P1 (fixture line-pinning is a verify-not-guess build step)

```yaml
- type: FINDING # enum-gated (TRUSTED)
  rule_id: P1 # enum-gated — cited (P4)
  severity: minor # advisory assignment (fix #3)
  file: ".dev/features/resource-leak-lens/PLAN.md:79" # enum-gated — resolves
  problem: "Every expected file_resolves line and finding_count is 'pinned at build'; if a line is guessed rather than read from the scanner's actual output, check-structural.mjs silently fails at /pharn-dev-verify." # free-text — DATA
  evidence: "Lines 79 & 82 defer line pinning to build. This is correct (P6) but load-bearing: build MUST run `scan-code-resource-leak.mjs` over each committed fixture and copy the reported line into the expected, never assume it." # free-text — quoted DATA
```

Advisory ask: `/pharn-dev-build` runs the scanner over each fixture and sets `file_resolves` / `finding_count` from its actual stdout (P6). This is a reminder, not a plan defect.

## Griller-axis notes (advisory)

- **testability (P1) — PRESENT.** Layer 1: the plan declares a full verification approach — a 4-case eval suite (positive, two negatives, ★ injection) + a hermetic scanner test with exit-code / ★ / fail-closed assertions. No absence finding. Layer 2 (adequacy): adequate; the only nudge is F4/F5 above (clean-case shape + line-pinning) and that build should mirror swallowed-exception's _rich_ scanner edge-case tests (brace/paren edges, multiple bindings ordering), not only the four eval-mirroring cases.
- **error-handling (P7) — PRESENT.** The scanner is fail-closed (missing/non-file → nonzero exit, nothing on stdout) and carries a documented-bounds section. No absence finding. Layer 2: F2/F3 ask only that two more bound cases be _disclosed_ — no unhandled failure surface.
- **architecture (P3) / coupling — clean.** One axis of change (detect unclosed resources); lens `reads:` routes the shared abstraction through the root `pharn-contracts/finding-shape.md` (no leaf→leaf sibling ref); the scanner is `.dev/floor/` build-apparatus invoked by path, not a product-layer import. `coupling: agnostic` is correct — the JS/TS shape-specificity is a _detection bound_, not an axis-of-change coupling.
- **security (P2) — clean (well-covered).** This is the lens's own enforced principle: injection-immune-by-construction scanner (masked-text membership), taint confined to free-text, `file` = scanner line, `needle_absent_from_enum_gated` trip-wire, named residual (LIMITS §2). The ★ eval + scanner ★ tests exercise it.
- **documentation / comprehension — clean** apart from F1's wording nudge.
- **a11y, i18n, migrations, privacy, observability, performance — N/A** to this increment (no UI, locale, schema/data migration, PII, service telemetry, or hot path). No findings.

## Prose summary

The plan is strong and low-risk: it introduces **no new pattern**, only a new subject (unclosed resources), faithfully mirroring the `scan-code-null-deref` binding-anchored detection and the `swallowed-exception` lens/eval/test shape — both read live this run. The guarantee audit is honest (floor = enum-regex scanner + membership + eval-time check-structural; advisory = "truly leaks / close elsewhere"), the trust audit is complete (taint → free-text only; `file` = scanner line; needle trip-wire; named residual), and determinism/one-axis/scope are clean. Spec-hash matches — no drift.

The five advisory findings are all **minor** and cluster on two harmless themes: (a) **disclose two more scanner bounds** (a bare `finally` is not cleanup; the arg-form match can false-CLEAN on a non-target NAME) and sharpen "scope"→"in this file" wording (P0 honesty), and (b) **de-risk the eval fixtures at build** (mirror swallowed-exception's clean-case expected; pin `file_resolves`/`finding_count` from the scanner's actual output, not guesses). None blocks; all are cheap to fold in during `/pharn-dev-build`.

No injected/hostile content was present in the plan (it is a self-authored trace); nothing to report as an attack payload.

## Verdict

**ADVISORY VERDICT: 5 concerns raised (0 blocking-severity, 5 minor/advisory) — for the human to weigh before `/pharn-dev-build`.** This is an advisory grill-log; it does **not** pass/fail and does **not** gate `/pharn-dev-build`. The only deterministic checks are the spec-hash (matches — surfaced here) and, at build, `.dev/floor/validate.mjs` + the writes-scope hooks. "Produced a GRILL.md" never means "the plan is good" (P0).
