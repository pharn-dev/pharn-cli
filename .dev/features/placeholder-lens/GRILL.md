# GRILL — placeholder-lens (interrogation of .dev/features/placeholder-lens/PLAN.md)

- Plan under interrogation: `.dev/features/placeholder-lens/PLAN.md`
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking here):** `sha256(ARCHITECTURE.md)` = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **matches** the plan's `spec_content_hash`. No drift. (The actual block on drift is `/pharn-dev-build`'s floor-gate, fix #4 — this only surfaces.)
- Griller membership (deterministic, `count-grillers.mjs .`): **13 registered**. Relevant axes applied inline: testability, architecture, coupling, security, error-handling, documentation, performance, honest-scope/P7. The product-app grillers (a11y, i18n, migrations, observability, privacy) are **not applicable** to this apparatus/lens increment (no UI, no i18n, no schema/PII surface) → no findings.
- **This whole grill-log is ADVISORY (P0).** Nothing here blocks `/pharn-dev-build`. It surfaces concerns for the human to weigh; it does not "pass" or "ensure" the plan.

## Findings (finding-shape; enum-gated / free-text split honored — the free-text quotes the plan as DATA, P2)

### Axis: testability / eval-robustness (P1)

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P1 # enum-gated
  severity: minor # enum-gated value; ASSIGNMENT is advisory (fix #3)
  file: ".dev/features/placeholder-lens/PLAN.md:97" # enum-gated — resolves
  problem: "Pass A scans RAW text, so a marker token appearing in a fixture's markdown PROSE (not just the fenced code) would add an unintended hit and silently change finding_count; nothing on the floor enforces marker-free prose."
  evidence: "PLAN L97: 'the scanner run over a .md eval fixture would also hit a marker token appearing in the fixture's PROSE. The five fixtures' prose is therefore authored to avoid the literal marker tokens'."
```

_Advisory note:_ the plan already commits to oblique prose, and a miscount would be caught by the eval's own `finding_count` assertion at check time — so the blast radius is a failing eval, not a silent wrong guarantee. Still worth build-time care (author prose to avoid `TODO`/`FIXME`/`STUB`/`PLACEHOLDER`/`not implemented`, and re-run the scanner over each finished fixture to confirm only the intended code line hits).

### Axis: architecture / one-axis-of-change (P3)

```yaml
- type: FINDING
  rule_id: P3
  severity: minor
  file: ".dev/features/placeholder-lens/PLAN.md:54"
  problem: "One scanner file bundles two detection strategies (raw-text marker membership + masked-text empty-body brace-match) that change for different reasons — a new marker family vs. a new function-form — arguably two axes in one file."
  evidence: "PLAN L54: 'scan-code-placeholder.mjs — NEW deterministic scanner: fixed placeholder-marker membership (raw text) + empty-function-body brace-match (masked text)'."
```

_Advisory note:_ defensible as **one** concern (both detect "placeholder shipped as done," both feed one `P2` finding, both are apparatus under `.dev/floor/` where P3's per-file axis is softened, and the sibling `scan-code-*` family already co-locates related sub-checks). Surfaced so that IF the two strategies later diverge in maintenance, the human considers splitting them then (P7 — not now).

### Axis: honest-scope / no-speculation (P7)

```yaml
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/features/placeholder-lens/PLAN.md:23"
  problem: "Empty-body detection was promoted to the FLOOR via the human's open-question resolution, not by an observed dogfood/eval failure; the plan should be explicit that the P7 trigger here is a human/brief directive."
  evidence: "PLAN L23: 'Empty-body detection is included on the floor per the human's resolution of this plan's open question.'"
```

_Advisory note:_ **grounded, not speculative** — "empty function bodies where logic expected" is named in the founding increment brief, so empty-body detection was always in the lens's remit; the human only resolved floor-vs-advisory. Recorded for transparency: the justification chain is brief + human authority, which is legitimate, and distinct from the usual "a real failure surfaced it."

### Axis: guarantee-precision (P0) — the FLOOR claim rests on a copied mask being correct

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: ".dev/features/placeholder-lens/PLAN.md:85"
  problem: "The empty-body FLOOR claim depends on the comment/string mask being correct, but the plan REUSES (copies) scan-code-swallowed-exception.mjs's mask idiom into a new file; a copied-but-untested masker would make the 'FLOOR' claim rest on unverified code."
  evidence: "PLAN L85: 'reusing scan-code-swallowed-exception.mjs's mask idiom for Pass B'."
```

_Advisory note:_ the plan does commit to hermetic tests (`scan-code-placeholder.test.mjs`). Surfaced so the build ensures the new scanner's **own** tests cover the mask/empty-body edges that make the reduction sound — braces inside a string within a body, a comment-only body (→ `empty-body`), a `.catch(cb => {})` method not mistaken for a function, and a body with real work (→ CLEAN) — not merely the marker cases. The FLOOR label is only earned once those pass in this file.

## Prose summary

The plan is a faithful, well-reduced mirror of the `swallowed-exception` scanner-lens precedent: the guarantee audit cleanly separates the deterministic marker/empty-body detection (FLOOR) from the real-placeholder-vs-intentional-stub judgment (ADVISORY), the "two clocks" honesty is present, the disease-claim ("ensures the code is complete") is explicitly struck, the trust audit routes the injected comment into free-text only with a `needle_absent_from_enum_gated` trip-wire, and every branch is a membership test with an ask-the-human terminal fallback. The spec hash is un-drifted. The four concerns above are all **minor build-time-care items**, not design faults: (1) keep fixture prose marker-free; (2) accept the two-strategies-in-one-file bundle as one concern, splitting only if they diverge; (3) note empty-body's P7 trigger is the human/brief directive; (4) ensure the copied mask + empty-body edges are covered by the new scanner's own hermetic tests, since the FLOOR claim rests on them. No guarantee is claimed without a floor reduction; no untrusted free-text gates a decision.

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 blocking-severity, 4 minor/advisory) — for the human to weigh before /pharn-dev-build.** This is not a gate and not a guarantee that the plan is sound; `/pharn-dev-build`'s floor-gates (spec-hash drift, unresolved `## Open questions (HALT)`) and `.dev/floor/validate.mjs` remain the deterministic backstops. The plan's one open question is marked RESOLVED, so it will not trip the build's open-questions gate.
