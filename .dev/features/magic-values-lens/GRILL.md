# GRILL — magic-values lens (REV 2 PLAN.md)

Interrogated: `.dev/features/magic-values-lens/PLAN.md` (REV 2). **Spec-hash check:** recomputed
`sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the
plan's pinned `spec_content_hash`; no drift. (The hash compare is floor-grade; here it only surfaces —
`/pharn-dev-build`'s fix #4 gate is where drift blocks.)

Grillers discovered by deterministic membership (`.dev/floor/count-grillers.mjs .` → 13 registered).
**Applied by axis (inline; isolated runner deferred P7):** architecture, coupling, comprehension,
documentation, error-handling, security, testability. **Not applicable to a markdown-lens + Node
pattern-scanner increment** (no UI / i18n / DB / runtime-observability / PII / hot-path surface): a11y,
i18n, migrations, observability, privacy, performance — noted N/A, no findings.

> The PLAN.md is `trust: untrusted` here. Each finding's enum-gated fields (`type`/`rule_id`/`severity`/
> `file`) are my own membership/path assertions; the free-text `problem`/`evidence` quote the plan as
> DATA. **`/pharn-dev-grill` is advisory end-to-end — none of the below gates `/pharn-dev-build`.**

## Findings — architecture / one-axis (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: important
  file: ".dev/features/magic-values-lens/PLAN.md:51"
  problem: "The single scanner file hosts two detection constructions with independent reasons to change — the masked-numeric value-set regex and the string span-tracking/operator-prefix logic — which a strict P3 reading (one axis of change per file) would split into two files."
  evidence: "'The string sub-check adds a second construction (record real string spans; flag an equality op before a non-empty span) — a distinct axis from the masked-numeric regex, folded into this one scanner by the human's explicit GATE-1 decision (the two-axis increment).'"
```

The plan **names** this tension honestly rather than hiding it, and the human explicitly accepted the
two-axis bundle at GATE 1 — so this is not a smuggled violation. But the griller's job is to re-surface
it: numeric-magic-detection and string-magic-detection change for different reasons (a new numeric form
vs a new string form vs a masking fix), so P3 would prefer either two scanner files behind the one lens
or two lenses. **For the human to re-weigh before `/pharn-dev-build`** — the accepted tradeoff is fewer
PRs now against P3/P7 cleanliness.

## Findings — honest scope / smallest increment (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: ".dev/features/magic-values-lens/PLAN.md:8"
  problem: "This is not the smallest coherent increment: it bundles numeric AND string magic-value detection, where REV 1's own recommendation was numeric-only with strings as a documented future increment; the string half has no distinct triggering failure beyond the choice for breadth."
  evidence: "'build the LARGER, two-axis increment — detect magic numbers AND magic strings now … The two-axis cost (a distinct string-detection construction; a bigger PR than the off-by-one mirror) was explicitly accepted.'"
```

P7 favors the smallest coherent increment triggered by a real need. A review lens is roadmap-triggered
(the plan states this plainly, mirroring `off-by-one`); the **string** sub-shape specifically is added
for scope breadth, not a dogfood/eval failure. The human chose to bundle at GATE 1. **Surfaced to
re-weigh:** splitting into a numeric-only PR now + a string follow-up would restore the one-axis/one-PR
discipline; the accepted plan trades that for a single larger increment.

## Findings — floor-claim robustness / testability (P0, testability griller)

```yaml
- type: FINDING
  rule_id: P0
  severity: important
  file: ".dev/features/magic-values-lens/PLAN.md:51"
  problem: "The string sub-check's 'injection-immune by construction' claim is less self-evident than off-by-one's single masked regex — it leans on span-recording, escape handling, and an 'immediately-preceding equality operator' test — so its floor grade depends heavily on test coverage of that novel logic."
  evidence: "'record real string spans; flag an equality op before a non-empty span' — a multi-step construction whose correctness (and injection-immunity) is only as strong as the scanner's test suite."
```

Not a P0 violation — the sub-check does reduce to primitive #3 (deterministic pattern/span matching,
no LLM). But the reduction is carried by more moving parts than the numeric regex. **Advisory ask of
`/pharn-dev-build`:** make the `scan-code-magic-values.test.mjs` suite explicitly cover the span-tracking
edge cases — escaped quotes inside a string (`"a\"b"`), adjacent string literals (`"a"==="b"`),
string-then-line-comment, an equality op with intervening whitespace/newline before the string, and a
`===` that lives inside a comment/string (must NOT match) — so the injection-immunity claim is proven,
not asserted.

## Findings — eval precision & trust trip-wire (P1, P2)

```yaml
- type: FINDING
  rule_id: P1
  severity: minor
  file: ".dev/features/magic-values-lens/PLAN.md:17"
  problem: "The `file_resolves` assertions must cite the PHYSICAL .md line of the comparison inside the fenced code block (as off-by-one used :15), not a line within the code snippet; a mismatch is a deterministic RED at check-structural time."
  evidence: "'file_resolves at the `>` line' / 'file_resolves at the `===` line' — the build must author the fixture so the comparison sits on a known physical line and the expected.json references exactly that line."
```

```yaml
- type: FINDING
  rule_id: P2
  severity: minor
  file: ".dev/features/magic-values-lens/PLAN.md:38"
  problem: "The string ★ case's in-string injection payload must be a distinctive substring so `needle_absent_from_enum_gated` is a real trip-wire — a payload that would actually be caught if the lens laundered the string content into an enum-gated field."
  evidence: "'the string-content injection payload absent from every enum-gated field (proving the untrusted string CONTENT is fenced to free-text)' — the proof only holds if the needle is distinctive enough that laundering would surface it."
```

## Findings — documentation carry-forward (documentation griller)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/magic-values-lens/PLAN.md:50"
  problem: "The extensive out-of-scope list (Yoda form, non-decimal numbers, template-literal strings, switch/case strings, relational-string compares, cross-file) lives in the plan; it must be carried into the lens.md Scope section and the scanner file header, or the honest-bounds discipline is lost at the product surface."
  evidence: "'Yoda (`404 === x`), non-decimal numbers …, relational string compares, switch/case strings, template-literal (backtick) strings, cross-file — → ADVISORY / out of scope (P7).'"
```

## Prose summary

REV 2 is internally coherent and unusually honest about its own costs: its guarantee audit labels the
scanner FLOOR and the needs-a-name judgment ADVISORY, its trust audit correctly identifies the
string-content-fenced-to-free-text case as the sharpest P2 demonstration, and it names — rather than
hides — the P3/P7 tension created by folding two detection constructions into one increment. The two
substantive concerns (P3: two axes in one scanner file; P7: not the smallest increment) both stem from
the **accepted** GATE-1 decision to build numbers + strings together; they are re-surfaced here so the
human weighs them with grill in hand, not to re-litigate a settled call. The floor-claim robustness of
the _string_ sub-check is the one build-time risk worth pinning: unlike off-by-one's single masked
regex, its injection-immunity rests on multi-step span logic and must be **proven by the test suite**,
not merely asserted. The remaining items are build-precision nits (exact `file_resolves` lines; a
distinctive in-string needle; carrying the out-of-scope list to the product surface).

ADVISORY VERDICT: 6 concerns raised (3 important-severity, 3 minor) — for the human to weigh before
`/pharn-dev-build`. No concern blocks the build; `/pharn-dev-grill` gates nothing (fix #3). The deterministic
backstops remain `/pharn-dev-build`'s floor-gates (spec-hash drift; unresolved `## Open questions (HALT)` —
the plan reports none) and `.dev/floor/validate.mjs`.
