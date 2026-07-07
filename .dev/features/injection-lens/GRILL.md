# GRILL — injection-lens (advisory interrogation of PLAN.md)

- Plan under interrogation: `.dev/features/injection-lens/PLAN.md` (`trust: untrusted` to this griller).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** recomputed
  `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches**
  the plan's pinned `spec_content_hash`. No drift. (The actual drift _block_ is `/pharn-dev-build`'s floor-gate,
  fix #4 — not this stage.)
- Griller registry (deterministic membership, `.dev/floor/count-grillers.mjs`): **13 registered**.
- Deterministic plan-scanners run over the PLAN: `scan-plan-secrets` clean, `scan-plan-pii` clean,
  `scan-plan-i18n` clean, `scan-plan-migrations` clean; `scan-plan-observability` flagged `tracing` (L19/32/105)
  — a **false positive** (the plan says _taint_ tracing / data-flow, not telemetry; advisory triage below).

## Findings (finding-shape; enum-gated / free-text split honored) — ALL ADVISORY

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P1 # enum-gated — eval integrity (the structural[] assertions must be satisfiable)
  severity: important # enum-gated value; ASSIGNMENT advisory (fix #3) — grill gates nothing
  file: ".dev/features/injection-lens/PLAN.md:93" # enum-gated — resolves
  problem: "Each eval fixture .md must contain EXACTLY the intended number of scanner-matching lines (concat→1, parameterized→0, safe-comment→1) — the scanner scans ALL lines of the .md, so stray prose/example code that matches a sink+taint pattern would break finding_count and file_resolves."
  evidence: "L93: 'case-parameterized → 0 findings (finding_count == 0)'. If any prose line in that fixture matches e.g. the SQL regex, finding_count becomes >0 and the eval RED-fails at check-structural."

- type: FINDING
  rule_id: P0 # enum-gated — a structurally-pinned value the build must emit exactly
  severity: minor
  file: ".dev/features/injection-lens/PLAN.md:92" # enum-gated — resolves
  problem: "The eval pins severity=important via field_equals; although severity ASSIGNMENT is advisory (fix #3, a lens never gates), the value is STRUCTURALLY asserted — the build must instruct the lens to emit exactly 'important', or check-structural RED-fails."
  evidence: "L92: 'severity important (advisory value, fix #3)'. The advisory-ness is about gating, not about the eval's field_equals, which is an exact-match floor check."

- type: FINDING
  rule_id: P1 # enum-gated — eval coverage of the scanner's kinds at the LENS level
  severity: minor
  file: ".dev/features/injection-lens/PLAN.md:94" # enum-gated — resolves
  problem: "command-injection and html-injection sink classes have NO lens eval case — they are exercised only in the scanner's hermetic tests. P1 is satisfied (P2 is bound by case-sql-concat), but the lens's behavior on the command/HTML kinds is not eval-pinned."
  evidence: "L94 + the parenthetical after it: 'Command-injection and HTML/XSS sink classes are covered exhaustively in scan-code-injection.test.mjs … Adding lens eval cases … is a later increment … (P7).' Acceptable under the secrets-in-code precedent; surfaced so a future dogfood adds lens cases if the classes prove under-exercised."

- type: FINDING
  rule_id: P2 # enum-gated — the laundering trip-wire must be non-vacuous
  severity: minor
  file: ".dev/features/injection-lens/PLAN.md:94" # enum-gated — resolves
  problem: "The needle 'already sanitized' must appear VERBATIM in the case-safe-comment fixture's injected comment, or needle_absent_from_enum_gated is a vacuously-passing test (a needle absent from the input can never be laundered)."
  evidence: 'L94: ''needle_absent_from_enum_gated: "already sanitized"''. The build must write the fixture comment to contain that exact substring so the trip-wire actually exercises the fence.'
```

## Griller-axis notes (advisory; grillers gate nothing — fix #3)

Live isolated per-griller runner is deferred (P7); axes applied inline over the plan.

- **security** (`grillers/security`) — most relevant: the plan _is_ an injection detector. The plan itself
  discloses no insecure directive; its threat framing (untrusted CODE input, taint-free detection) is sound.
  No security finding against the plan.
- **architecture / coupling** (`grillers/architecture`, `grillers/coupling`) — clean. One axis per file
  (lens = the injection lens; scanner = the PATTERNS set, "the only axis of change"). `reads:` routes only
  through `pharn-contracts` (the bottom) + the artifact-under-review — no sibling reference (P3).
- **testability** (`grillers/testability`) — the P1/eval-integrity finding above is fundamentally a
  testability concern (the fixtures must be constructed so the structural[] assertions are satisfiable and
  non-vacuous). Otherwise the eval design (positive / true-negative / hostile) mirrors the proven
  secrets-in-code shape.
- **comprehension / documentation** (`grillers/comprehension`, `grillers/documentation`) — the plan is
  explicit about the floor/advisory boundary and the "NOT taint analysis" red line; low comprehension debt.
- **observability** (`grillers/observability`) — the deterministic `tracing` hits (L19/32/105) are a
  **false positive**: "taint tracing" / "cross-function taint" is data-flow analysis, not telemetry. Not an
  observability concern for a methodology capability. (Honest note: the scanner is a term-membership floor
  check; its advisory layer is what triages the sense.)
- **a11y / i18n / migrations / privacy / performance / error-handling** — **not applicable** to a product
  lens over code text (no UI, no user-facing copy, no schema change, no PII handling, no hot path, no runtime
  error surface). Their deterministic plan-scanners (where present) ran clean above.

## Prose summary

The plan is tightly scoped, honestly bounded, and mirrors an established, reviewed precedent
(`secrets-in-code` + `scan-code-secrets.mjs`) almost one-to-one. Its guarantee audit reduces every claim to
a floor primitive or an explicit `advisory` label, and the disease claim ("this code is injection-safe") is
struck. The trust audit is complete (taint-free detection; `file`-line from the scanner, never a comment;
`needle_absent` trip-wire; residual named). Determinism and one-axis are satisfied.

The concerns are **not** design flaws — they are **build-time construction obligations** the build must
honor so the (already-correct) eval design actually passes deterministically: (1) fixtures must contain
exactly the intended count of scanner-matching lines; (2) the lens must emit the structurally-pinned
`severity: important`; (3) the `already sanitized` needle must be verbatim in the hostile fixture; and (4) an
honest, non-blocking note that command/HTML classes are scanner-tested but not lens-eval'd (acceptable under
P7 + precedent). The empirical 19/19 regex validation in the plan de-risks the scanner itself.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 1 important, 3 minor) — for the human to weigh
before /pharn-dev-build.** This grill-log gates nothing (`/pharn-dev-grill` is advisory end-to-end; the only
floor-grade facts here are the writes-scope hook and the content-hash check, both labeled). The spec-hash
matches and no constitution violation was found in the plan. "Grill produced a GRILL.md" does NOT mean "the
plan is good" (P0) — that judgment is the human's.
