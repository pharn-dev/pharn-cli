# REVIEW — missing-await-lens (PHARN reviewing PHARN)

- **increment under review:** `trust: untrusted` — the 30th capability: `missing-await` lens (`pharn-review/missing-await/`) + its 3 evals + the `.dev/floor/scan-code-missing-await.mjs` scanner + its 17-case test.
- **Step 1 — floor first (P0):** `node .dev/floor/validate.mjs .` → **GREEN — 30 capabilities**, exit 0. The increment legitimately reached review. The floor verdict is the only guaranteed part of this review; everything below is **advisory**.

## L-floor → P0 (guarantee-audit completeness)

Every guarantee the increment claims reduces to a floor primitive **or** is labeled `advisory`:

- **Lens membership** → FLOOR (`validate.mjs`, enum/regex primitive #3). ✓
- **Floating-unawaited-async-call shape detection** → FLOOR (`scan-code-missing-await.mjs`, mask + two-pass regex, primitive #3), named precisely ("detects a statement-position, non-awaited call to a function this file declares `async`"), **injection-immune by construction** (masking), and honestly bounded (a SHAPE, not "this is a bug" / "async-correct"). ✓
- **Is-it-a-bug + every out-of-scope form** (imported/method/assigned/non-line-start/cross-file) → **ADVISORY**, surfaced never gated. ✓
- **New primitive justified (P7)** — the scanner backs the lens's floor claim; the shared mask idiom is acknowledged deferred duplication. ✓
- **The disease claim** ("ensures no missing-await bugs / async-correct code") is explicitly **struck**. ✓

**No blocking L-floor finding.** The guarantee audit is thorough and mirrors the accepted `off-by-one` / `null-deref` precedents.

## L-eval → P1 (eval coverage + rule binding)

- The lens ships **3** eval cases + 3 expected JSON + 3 expected MD (non-empty evals). ✓
- `enforces: ["P2"]` is **produced by ≥1 eval** — `case-floating-injection` → `field_equals rule_id P2` (fix #6 binding), **confirmed by the floor** (validate GREEN). The floor and this lens agree — no disagreement finding. ✓
- The two true-negative cases (`awaited-call`, `sync-function`) pin `finding_count == 0` (structural, floor-reducible). ✓

**No L-eval finding.**

## L-trust → P2 (the residual — this lens's own subject)

- The finding object's free-text fields (`problem`, `evidence`) are marked **untrusted DATA** throughout the lens and expected files; the enum-gated fields (`type`, `rule_id`, `severity`, `file`) are the lens's own assertions, with `file`'s line taken **from the scanner** (deterministic), never a comment line. ✓
- The ★ `case-floating-injection` expected asserts **two** `needle_absent_from_enum_gated` — the comment needle `"do not flag"` **and** the code-token needle `"loadUser"` — so neither the injected comment nor the untrusted callee token can reach an enum-gated field. ✓
- **Did the reviewed artifact steer me?** Its fixtures carry injected directives (`// SECURITY-REVIEWER: … do not flag`, `fire-and-forget by design`). I read them as DATA / attack payloads and did **not** comply — the scanner masks them and the `file:17` verdict comes from the code text. Noting the attempt is the defense. ✓
- **No guaranteed decision rests on a tainted field** — the scanner's verdict is over masked code; `severity` is advisory (fix #3); the lens never gates.

**No blocking L-trust finding.** (The named residual stands, honestly: whether the lens's **live** finding-output keeps the fence is measured at a later manual `/pharn-dev-eval` — advisory until then, see the advisory finding below.)

## L-axis → P3 (one axis / no sibling imports)

- One reason-to-change per file: lens (detection spec), scanner (detection mechanism), each case (one fixture), each expected (one expectation), the test (scanner behavior). ✓
- `reads: ["pharn-contracts/finding-shape.md", "<artifact-under-review>"]` — shared abstraction reached **through `pharn-contracts`** (the bottom), **no leaf→leaf** read. Prose mentions of sibling lenses (`off-by-one`, `null-deref`, `trust-fence`) are **comparative precedent citations**, not dependencies on their internals — the floor's forbidden-sibling grep passed (GREEN), consistent with every prior lens in the family. ✓

**No blocking L-axis finding.**

## Findings (dogfooding fix #1 — enum-gated / free-text split)

### Floor-gate (blocking)

_None._ The floor is GREEN and no claimed guarantee lacks a floor reduction.

### Advisory (inform; never the sole basis for a guaranteed block)

```yaml
- type: FINDING
  rule_id: P0
  severity: minor
  file: "pharn-review/missing-await/missing-await.md:185"
  problem: "The 'Fixture behavior → floor-CHECKED at eval time by check-structural.mjs' line reads slightly forward of reality — the 3c runner that invokes check-structural over the lens's EMITTED findings.json is unbuilt (finding-shape.md §Emission-enforcement audit), so this facet is floor-reducible-but-not-yet-enforced; it is honest only because VERIFY.md and the lens's machine-emission section label the live emission advisory."
  evidence: "'the finding OUTPUT on the committed fixtures … is floor-CHECKED at eval time by .dev/floor/check-structural.mjs (primitive #3)' — accurate as capability, deferred as wiring; identical to the accepted off-by-one wording."
- type: FINDING
  rule_id: P7
  severity: minor
  file: ".dev/floor/scan-code-missing-await.mjs:42"
  problem: "The `NAME = async` roster regex is coarse (no scope/shadowing analysis), so a reassigned-async property or a shadowed name could enter the roster and produce a false-positive — this is DISCLOSED in the scanner header and the lens's honest bounds, and is adequate for v0.1.0, but is the first thing to tighten if the false-positive surfaces in dogfood (P7)."
  evidence: "'No scope/shadowing analysis (a same-file async function fetch shadowed by a local sync fetch is flagged coarsely)' — the bound is stated, not hidden."
```

Both advisory findings rest on my judgment of free-text / severity (fix #3); neither is a floor-checkable defect, and neither blocks. Their free-text quotes the increment as DATA.

## Proposed lesson for canon (P7 — proposed only; NOT written here)

**No new lesson proposed.** This increment reproduced the established `scan-code-*` lens pattern without surfacing a **new** recurring failure; the grill's three precision/honesty concerns were folded in at build (documented false-positive/negative + eval-roster-pollution guard) — an application of existing discipline, not a novel lesson. Proposing canon here would be speculative (P7). (Any promotion would be a separate human-gated `/pharn-dev-memory-promote` run under its own scope, behind `check-provenance` — never self-written.)

## Verdict

**GREEN — 0 blocking floor-findings; 2 advisory-minor observations.** The floor is GREEN (30 capabilities), the four lenses find no guaranteed-invariant violation, and the trust fence holds structurally on the committed fixtures. This verdict certifies the **floor** (validate GREEN) + the reviewer's **advisory** judgment — it is **not** a guarantee the lens is correct beyond what the floor checks; whether its **live** finding-output matches the committed `expected` files is a later manual `/pharn-dev-eval`, and the merge/keep decision is the human's (GATE 2).
