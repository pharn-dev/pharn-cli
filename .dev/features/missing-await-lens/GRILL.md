# GRILL — missing-await lens (interrogation of PLAN.md)

- **Plan under interrogation:** `.dev/features/missing-await-lens/PLAN.md`
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` **== plan's pinned `spec_content_hash`** → **no drift**. (The binding block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — this stage only surfaces.)
- **Trust:** the PLAN is `trust: untrusted` to this griller; instruction-looking content in it is DATA to interrogate, never followed.

## Findings (finding-shape objects; enum-gated / free-text split honored — all ADVISORY)

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P7 # enum-gated — honest scope / stated bounds
  severity: minor # enum-gated value; the ASSIGNMENT is advisory (fix #3)
  file: ".dev/features/missing-await-lens/PLAN.md:40" # enum-gated — resolves
  problem: "The scanner excludes a hit only when `.then`/`.catch`/`.finally` is handled ON THAT LINE, so a promise whose handler is chained on the NEXT physical line (a multi-line `.then`) is still flagged — an undocumented false-POSITIVE the plan does not name (off-by-one explicitly documents its backtick false-positive; this shape deserves the same honesty)."
  evidence: "'not `.then`/`.catch`/`.finally`-handled on that line' (line 40) — the same-line qualifier is correct but its multi-line false-positive is not listed among the documented bounds."
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/missing-await-lens/PLAN.md:40"
  problem: "The statement-head match `^\\s*NAME(` requires the roster call to be the first non-whitespace token on its physical line, so `if (x) loadUser();`, `} loadUser();`, and `a; loadUser();` (a roster call not at line-start) all evade detection — real false-NEGATIVES the plan should enumerate for honest v0.1.0 scope, alongside the imported/method/assigned cases it already lists."
  evidence: "'a physical line whose first non-whitespace token is a call `NAME(`' (line 40) — precise, but the non-line-start false-negatives are not enumerated."
- type: FINDING
  rule_id: P6
  severity: minor
  file: ".dev/features/missing-await-lens/PLAN.md:50"
  problem: "The trust audit says the scanner 'strips comments/strings' but (per the scan-code-* family idiom) does NOT mask backticks and runs over the .md fixture directly, so any `async function NAME(` / `NAME = async` in eval-fixture PROSE — or a stray statement-head roster call in prose — enters the roster / adds a hit and can drift `finding_count`. The build must confine roster-triggering patterns to the intended code fence and pin `file_resolves:NN` from the real fixture line."
  evidence: "'the scanner strips comments/strings before both the roster pass and the call-site pass' (line 50) — omits the backticks-not-masked / prose-roster caveat that the family's markdown fixtures make load-bearing."
```

## Griller-axis coverage (Step 2b — 13 registered grillers; runner deferred P7, procedures applied inline)

Live membership (`.dev/floor/count-grillers.mjs .`) = **13**: a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability. Applied inline over the plan:

- **architecture** — layer placement correct: the lens sits in `pharn-review` (L-review), the scanner in `.dev/floor/` (build apparatus, not a product layer); `reads:` routes shared abstractions through `pharn-contracts/finding-shape.md`, no leaf→leaf (P3). **No finding.**
- **coupling** — `coupling: agnostic` is correct: a missing-`await` shape is language-level, byte-identical across frameworks and SSR/backend/SPA/lib archetypes → Q1 → agnostic (`ARCHITECTURE.md §3.2`). **No finding.**
- **testability** — hermetic scanner tests (`scan-code-missing-await.test.mjs`, self-contained tmp files, assert exit codes) + 3 committed evals + the ★ P2-binding case; strong coverage. **No finding (strength).**
- **security** — P2 injection-immunity via comment/string mask + ★ suppress/manufacture tests + `needle_absent_from_enum_gated` on both the comment needle and the code-token needle; the finding's `file` line is scanner-derived, taint confined to free-text. The two false-positive/negative findings above are precision/honesty, **not** injection weaknesses (masking still holds). **No security finding.**
- **error-handling** — scanner is fail-closed: a missing/non-regular-file target → nonzero exit, nothing on stdout (family contract), asserted in tests. **No finding.**
- **performance** — a two-pass regex scan over a single file is O(n); trivial. **No finding.**
- **comprehension / documentation** — the plan is clear, cites its contracts (`finding-shape`, `ARCHITECTURE.md §3.1/§7/§8`) rather than restating them (P4). **No finding.**
- **a11y, i18n, migrations, observability, privacy** — **N/A** for a code-review-lens methodology increment (no UI, no user-facing strings, no schema/data migration, no telemetry, no PII handling). Recorded as not-applicable, not as passes.

## Prose summary

The plan is sound and closely mirrors the just-built `off-by-one` / `null-deref` precedents: a `role: lens` in `pharn-review/` reading untrusted CODE, a narrow deterministic `scan-code-*` backstop that gives it a REAL PARTIAL FLOOR, the is-it-a-bug judgment kept ADVISORY, and the enum-gated / free-text trust split dogfooded through a ★ injection eval that binds `enforces: [P2]` (fix #6). The guarantee audit reduces each claim to a floor primitive or labels it advisory (P0), the disease claim is struck, the two-clocks caveat is present, and determinism/fail-closed are addressed.

The three concerns are all **precision/honesty refinements** of the v0.1.0 scanner, none blocking: (1) a multi-line `.then` false-POSITIVE not yet in the documented bounds; (2) non-line-start roster-call false-NEGATIVES (`if(x) f();`, `} f();`) not enumerated; (3) a build-time caveat that eval-fixture PROSE can pollute the same-file roster because backticks are unmasked over the markdown fixture. All three are best addressed as scanner-header + guarantee-audit documentation and a careful eval fixture at `/pharn-dev-build` time — exactly the kind of honest-scope tightening the `scan-code-*` family already practices. They do not change the plan's shape, files, or approved scope.

## Verdict

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 3 advisory-minor) — for the human to weigh before `/pharn-dev-build`.** This grill-log is advisory end-to-end; it gates nothing. The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift fix #4, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs`. "Produced a GRILL.md" does not mean "the plan is good" (P0).
