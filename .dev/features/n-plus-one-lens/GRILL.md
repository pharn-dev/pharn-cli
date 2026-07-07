# GRILL — n-plus-one-lens (interrogation of `.dev/features/n-plus-one-lens/PLAN.md`)

- **Plan under interrogation:** `.dev/features/n-plus-one-lens/PLAN.md` (approved; braceless-arrow folded in at the gate).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` recomputed live = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **MATCHES** the plan's pinned `spec_content_hash`. No drift. (The actual drift _block_ is `/pharn-dev-build`'s floor-gate, fix #4 — this only surfaces it early.)
- **Trust:** the PLAN is `trust: untrusted` to the griller; its self-claims are interrogated, never believed. Findings' free-text quotes the plan as DATA.
- **This grill-log is ADVISORY end-to-end. It gates nothing. It is NOT "grill passed."**

## Findings (finding-shape objects; enum-gated / free-text split honored)

### Axis: guarantee-precision (P0) — the strongest concern

```yaml
- type: FINDING # enum-gated (griller's own assertion) — TRUSTED
  rule_id: P0 # enum-gated — cited, not restated (P4)
  severity: important # enum-gated value; the ASSIGNMENT is advisory (fix #3) — the griller never gates
  file: ".dev/features/n-plus-one-lens/PLAN.md:4" # enum-gated — resolves to the increment line
  problem: "The increment line lists `.forEach`/`.map` under 'brace-delimited blocks', but the precise floor claim (line 43) and the determinism audit (line 59) handle `.forEach`/`.map` via a call-argument PAREN interval (covering braced AND braceless callbacks) and reserve the BRACE pass for `for`/`while` only — an internal inconsistency in how the detector is described, which the build agent must resolve to a single crisp model."
  evidence: "line 4: '…Loop bodies include **brace-delimited** `for`/`while`/`.forEach`/`.map` blocks AND **braceless-arrow** `.forEach`/`.map` callbacks…' vs line 43: 'loop-body intervals = (a) `{`-delimited bodies whose header matches `for`/`while` **and** (b) the call-argument paren range of a `.forEach`/`.map` member call' vs line 59: 'a brace-depth pass over `for`/`while` bodies, and a paren-depth pass over `.forEach`/`.map` call arguments'."
```

**Griller's read (advisory):** lines 43 and 59 are the crisp, consistent model — **`for`/`while` → brace interval; `.forEach`/`.map` → paren interval** (the paren range already covers both the braced and the braceless-arrow callback, so `.forEach`/`.map` need not be in the brace-header set). Line 4's phrasing muddles this by grouping `.forEach`/`.map` with the brace-delimited forms. The build should implement lines 43/59 and treat line 4 as loose prose. Not blocking (the build's own floor is `validate.mjs` + the scanner's tests), but worth tightening so the guarantee is _named precisely_ (P0).

### Axis: testability / performance-of-the-scanner (P1) — adequacy note

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/n-plus-one-lens/PLAN.md:59"
  problem: "The paren-interval mechanism (new vs the single-regex off-by-one sibling) introduces edge cases the scanner tests must pin, or the 'deterministic / injection-immune' floor claim is asserted but not backed."
  evidence: "line 59 declares 'two loop-interval passes (a brace-depth pass over `for`/`while` bodies, and a paren-depth pass over `.forEach`/`.map` call arguments)'; the eval list (lines 30-36) covers receiver-outside-parens and braceless positives but does not name: an object-literal `{}` inside a braceless `.map(u => ({...}))` callback, a nested `outer.map(o => inner.map(i => db.query(i)))`, or a long member chain (regex backtracking)."
```

**Griller's read (advisory):** the plan's declared tests are already strong (injection immunity, batched negative, verb-precision negative, braceless positive, receiver-outside-parens). Recommend the build additionally test the three edge cases above so the paren/brace-depth matcher's determinism is _demonstrated_, not just claimed. Verification approach is **PRESENT** (P1 satisfied); this is a Layer-2 adequacy suggestion, never an absence finding.

### Axis: honest-scope (P7) — scope-growth note

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/n-plus-one-lens/PLAN.md:4"
  problem: "Folding in braceless-arrow enlarges this increment beyond its off-by-one precedent: the scanner now carries TWO loop-detection mechanisms (brace-depth + paren-depth) rather than one single-line regex — a larger unit of change, though a human-directed one, not speculative (P7 is satisfied)."
  evidence: "line 4: 'Loop bodies include brace-delimited `for`/`while`/`.forEach`/`.map` blocks AND braceless-arrow `.forEach`/`.map` callbacks (folded in at the approval gate).'"
```

**Griller's read (advisory):** P7 is _satisfied_ — the fold-in was an explicit human decision at the approval gate, not a hypothetical, and the plan honestly documents braceless _statement_ loops, `.filter`/`.reduce`/`for await`/`do..while`, and the ambiguous verbs as out-of-scope future increments. Surfaced only so the human weighs the added scanner complexity against the coverage gain they asked for.

## Griller sweep — 13 registered (live `count-grillers.mjs`, not asserted from the stale command doc, P6)

Registered set: a11y, architecture, comprehension, coupling, documentation, error-handling, i18n, migrations, observability, performance, privacy, security, testability. Applied by axis (inline, pre-runner — deferred P7):

- **performance (P7):** **no scaling-risk finding.** Poetic inversion — the plan _builds_ an N+1 detector; its own approach is a linear, single-file char-walk + per-line regex with no per-row fan-out, unbounded load, or sync-should-be-async. No unacknowledged scaling limit. (One micro-note folded into the P1 finding: guard the query-verb regex against pathological-chain backtracking.)
- **architecture (P3):** **fit recognized.** Mirrors the `off-by-one` precedent exactly — lens under `pharn-review/<name>/`, deterministic scanner under `.dev/floor/` in the `scan-code-*` family, evals under the lens dir, contracts via `pharn-contracts/finding-shape.md`. No layer inversion, no leaf→leaf sibling reference.
- **coupling (P3):** **clean seams recognized.** The scanner is standalone and stateless; the lens reads its output. The shared comment/string **mask** is a _copy_ (deferred-duplication, acknowledged in the plan) — duplication, not runtime entanglement; no shared mutable state, no hidden ordering.
- **testability (P1):** **presence recognized** (extensive `## Evals to write (P1)` + scanner test list). Adequacy captured in the P1 finding above.
- **security (P2):** **no finding.** The P2 trust-fence is handled thoroughly — masked detection, enum-gated `file` line taken from the scanner (never a comment line), the ★ injection eval + `needle_absent_from_enum_gated` on both the comment and the code token.
- **documentation / comprehension / error-handling:** documentation & error-handling (fail-closed on missing/non-file target, nonzero exit + nothing on stdout) are present and consistent with the family; the one comprehension wrinkle is the P0 finding above.
- **a11y, i18n, migrations, privacy, observability:** **axis not applicable** to a markdown review-lens plan (no UI, no locale strings, no DB schema migration, no PII handling, no runtime service). No findings — not asserted as "clean", simply out of axis.

## Prose summary

The plan is strong and closely mirrors the proven `off-by-one` precedent, correctly extended for the human-approved braceless-arrow scope. The **one concern worth acting on before build** is the P0 finding: the increment line (4) describes the `.forEach`/`.map` handling loosely, conflicting with the precise floor claim (43) and determinism audit (59) — the build should implement the crisp **for/while→brace, forEach/map→paren** model and keep the guarantee named precisely. The two P1/P7 notes are adequacy/scope suggestions, not gaps: verification is declared (P1 satisfied) and the scope growth is human-directed (P7 satisfied). Trust (P2), layering (P3), and the guarantee/advisory split (P0) are otherwise handled to the standard of the family.

## Verdict

**ADVISORY VERDICT: 3 concerns raised (0 blocking-severity, 1 important, 2 minor) — for the human to weigh before `/pharn-dev-build`.** Spec-hash matches (no drift). This is an interrogation, not a gate: `/pharn-dev-grill` blocks nothing, and none of these findings is a floor-gate. The deterministic backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved open questions) and `.dev/floor/validate.mjs`.
