# GRILL — race-condition-lens (ADVISORY; gates nothing — /pharn-dev-build is unaffected by this log)

- **Plan under interrogation:** `.dev/features/race-condition-lens/PLAN.md` (60 lines).
- **Spec-hash check (content-hash floor primitive — surfaced, not blocking):** `sha256(ARCHITECTURE.md)` recomputed this run = `11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969` — **MATCHES** the plan's pinned `spec_content_hash` (PLAN.md:3). No drift. (The block on drift, if any, is `/pharn-dev-build`'s floor-gate — fix #4 — not this stage.)
- **Trust:** the PLAN.md is `trust: untrusted` to this griller; its free-text is quoted below as DATA, never followed.

This log is **advisory end-to-end (P0)**. Nothing here blocks `/pharn-dev-build`; the deterministic backstops stay where they are (`/pharn-dev-build`'s spec-hash + unresolved-open-questions gates; `.dev/floor/validate.mjs`). The plan is **strong** — its P0 guarantee audit, P2 trust audit, and the no-scanner justification are unusually complete. The findings below are what it **omits or leaves implicit**, not a re-listing of what it got right.

## Findings (finding-shape objects; enum-gated / free-text split honored)

### Axis: P0/P1 — eval exercise mechanism (inline interrogation + testability griller)

```yaml
- type: FINDING # enum-gated (my own assertion)
  rule_id: P1 # enum-gated — evals-are-the-spec
  severity: important # enum-gated value; ASSIGNMENT is advisory (fix #3) — this gates nothing
  file: ".dev/features/race-condition-lens/PLAN.md:33"
  problem: "The 'assert exit codes' step for check-structural.mjs implies an exercised trip-wire, but no live lens runner (deferred P7) and no committed actual.json exist for this lens, so the structural[] check can only run against a HAND-BUILT actual at build time — not an automated verify-time gate over the lens's real output."
  evidence: "PLAN.md:33 — 'node .dev/floor/check-structural.mjs <expected>.json <conforming-actual>.json . → exit 0 … exit 1 on a laundered/suppressed variant … recorded in the build/verify trace'. The <conforming-actual>.json is not a committed file and not produced by any runner; check-structural.mjs needs both operands (its usage line), and finding-shape.md §Emission + eval-format.md §Guarantee-audit both label the runner-over-emitted-output as the deferred 3c wiring ('floor-reducible-but-not-yet-enforced')."
```

_Why it matters:_ the plan's own "Two clocks" bullet (PLAN.md:41) already concedes the runner is deferred; this finding asks the same honesty to reach the **"Assert exit codes"** step, so a reader does not read it as an always-on verify gate. **Recommended tightening (build-time):** state that the conforming + laundered `actual.json` are **hand-constructed demonstrations** (not committed product, not a runner), that they prove the structural[] assertions are well-formed and the needle trip-wire bites, and that the automated check over the lens's _emitted_ `findings.json` awaits the deferred 3c runner — exactly `trust-fence`'s status. This is a wording tightening, not a design change.

### Axis: P7 — the triggering rationale for "why this lens now" (inline interrogation)

```yaml
- type: FINDING
  rule_id: P7 # enum-gated — honest scope / no speculative additions
  severity: important
  file: ".dev/features/race-condition-lens/PLAN.md:4"
  problem: "The plan does not state the P7 trigger for adding a race-condition lens NOW; P7 requires an addition be justified by a real (dogfood/eval/roadmap) trigger, stated plainly — the sibling off-by-one plan did this explicitly and this one leaves it implicit."
  evidence: "PLAN.md:4 — the increment line ('Add one PRODUCT lens (pharn-review/race-condition/) …') names WHAT but not the P7 WHY-NOW. Contrast off-by-one-lens/PLAN.md, which states 'the capability … exists as part of the review-lens build-out (the code-side P2 lens family) … not in response to a specific dogfood failure, which for a review lens is the roadmap trigger, stated plainly (P7).'"
```

_Why it matters:_ without the named trigger, "why this lens now" reads as possibly-speculative — the precise thing P7 exists to force into the open. **Recommended tightening (build-time):** add one sentence to the lens's Scope/Guarantee-audit stating this lens is part of the **code-side P2 review-lens family build-out** (the roadmap trigger for a review lens), not a response to a specific dogfood failure — mirroring off-by-one. (Note: the human ratified the increment at GATE 1, so this is a documentation-of-trigger gap, not a scope dispute.)

### Axis: P2/P5 — the hard-coded `file`-line target (minor; the human already ratified "as written")

```yaml
- type: FINDING
  rule_id: P5 # enum-gated — determinism / the terminal fallback is ask
  severity: minor
  file: ".dev/features/race-condition-lens/PLAN.md:30"
  problem: "The eval hard-codes the finding's `file` line to the shared-state WRITE (the racy `cache = …` assignment); the CHECK line (`if (cache === null)`, where the race window opens and where a lock/single-flight would be acquired) is an equally-defensible target, so the eval encodes one of two reasonable line choices as the fixed structural expectation."
  evidence: "PLAN.md:30 and PLAN.md:48 — 'file = the shared-state write line … the racy `cache = …` assignment, never the injected comment's line'. Both write and check are control-flow-chosen (neither is the comment); the choice between them is judgment."
```

_Why it matters:_ `file_resolves` is a **structural** assertion — if the lens (or a future reader) reasonably points at the check line instead, the eval REDs on a non-defect. **Recommended (build-time):** keep the write line (defensible, mirrors trust-fence pointing at the _action_), but have the expected.md **explicitly note** the check line is an accepted alternative the eval does not assert, so the single hard-coded line is a documented choice, not an implied uniqueness claim.

### Axis: P6 — the retained `## Open questions (HALT)` section (minor; expected to pass per precedent)

```yaml
- type: FINDING
  rule_id: P6 # enum-gated — discovery-first / halt-and-ask
  severity: minor
  file: ".dev/features/race-condition-lens/PLAN.md:56"
  problem: "The PLAN.md still carries a `## Open questions (HALT)` section with two entries; both were RESOLVED by the human at GATE 1 (membership-only; one hostile case; approved as written), but the text is not annotated as resolved."
  evidence: "PLAN.md:56–59 — two entries phrased 'Confirm at the approval gate' / 'Confirm one hostile case…'. /pharn-dev-build (build.md:40) HALTs only on *unresolved* open questions; off-by-one-lens/PLAN.md shipped through the full chain WITH its own `## Open questions (HALT)` section intact — so this is expected to pass, surfaced only for awareness."
```

_Why it matters:_ if `/pharn-dev-build` unexpectedly reads section-presence as "unresolved," it would HALT. Precedent (off-by-one) says it keys on genuine unresolution and these are resolved-by-approval. `/pharn-dev-ship` will confirm empirically at the build stage and STOP-and-surface if build refuses.

## Grillers applied inline (membership is FLOOR; running is advisory — runner deferred P7)

`.dev/floor/count-grillers.mjs .` → **13 registered** (membership floor). Applied the axes most relevant to a review-lens plan; grillers **gate nothing** (fix #3):

- **architecture** (P3): **fit recognized, no finding.** The plan routes shared abstraction only through `pharn-contracts/finding-shape.md` (the bottom), adds no leaf→leaf reference, reuses the established `trust-fence` lens shape, and correctly refuses to add/misplace a scanner — no layering inversion, no reinvention.
- **testability**: **reinforces the P1 finding above** — the eval is membership-testable (`validate.mjs`) but its structural[] trip-wire has no committed actual/runner to exercise it automatically (deferred 3c).
- **coupling**: `coupling: agnostic` is correct (a data race is framework/archetype-invariant — Q1). No finding.
- **security**: this _is_ a P2 trust-fence-family lens; the plan's trust audit handles the untrusted-input taint correctly. No finding.

The remaining registered grillers (a11y, comprehension, documentation, error-handling, i18n, migrations, observability, performance, privacy) are off-axis for a concurrency review-lens plan; no findings **manufactured** for them (P7 — do not fabricate).

## Prose summary

The plan is honest and well-grounded — it correctly identifies the **membership-only floor / advisory race-judgment** split as the crux, and defends the **no-scanner** decision against the exact P0 disease (heuristic dressed as floor), citing two live precedents (`trust-fence`, `architecture-griller`). The concerns are two **important** wording/tightening gaps to fold in at build — (1) be as honest at the "Assert exit codes" step about the deferred runner / hand-built actual as the plan already is in its "Two clocks" bullet; (2) name the P7 roadmap trigger for building this lens now, as off-by-one did — plus two **minor** notes (the hard-coded write-line choice; the retained-but-resolved open-questions section). **None is a constitution violation; none blocks.**

## Verdict

**ADVISORY VERDICT: 4 concerns raised (0 constitution-blocking; 2 important, 2 minor) — for the human to weigh before /pharn-dev-build.** This is **not** "grill passed" and **not** a judgment that the plan is guaranteed sound (P0); it is a surfaced set of tightenings. The human approved the plan as written at GATE 1; `/pharn-dev-ship` proceeds to `/pharn-dev-build` regardless (grill gates nothing), and the two "important" items are recommended to fold into the built lens's prose (they do not change the file set, the floor posture, or the eval).
