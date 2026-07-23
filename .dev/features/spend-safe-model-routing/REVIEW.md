# REVIEW — spend-safe-model-routing

- Increment: commit `844bc92` (8 product files). Standing floor verdicts: build `npm run check` GREEN
  (395/395), regress `no-regressions`, verify `PASS`.
- **Step 1 floor-first (P0):** `.dev/floor/validate.mjs .` = **GREEN (0)** on a clean checkout of HEAD
  (the dirty-tree `1` is only gitignored `test-*/` fixtures — see VERIFY.md). The increment adds no PHARN
  markdown capability, so `validate` is vacuously green for it. Floor is the only guaranteed part of this
  review; everything below is **advisory**.

## L-floor → P0

Every guarantee the increment claims reduces to a floor primitive or is labeled advisory:

- "Fresh installs write `review = opus-4-8/high`" → **floor**: an enum-valid constant
  (`validateModelRouting` accepts it) asserted exactly in `tests/model-routing.test.ts` and end-to-end in
  `tests/init-archetype.test.ts` (`config.models toEqual DEFAULT_MODEL_ROUTING` + the explicit review
  assertion). Reduces to enum-regex + P1 test. ✓
- "The block is rendered FROM the written config, not re-hardcoded" → **floor**: `formatModelRoutingLines`
  is pure; `tests/model-routing.test.ts` feeds a NON-default routing and asserts the custom values appear.
  ✓
- "`opus-4-8/high` is spend-safe / cross-model review has catch value" → correctly **advisory** (a cost/
  quality judgment; no floor measures token spend). It is a rationale in the code comment, doc, and
  CHANGELOG — **not** presented as a floor guarantee, and it gates nothing. No P0 disease. ✓

**No blocking L-floor finding.**

## L-eval → P1

The increment adds **no PHARN Capability** (it is CLI TypeScript), so the "≥1 eval per Capability /
`rule_id`" binding does not apply; the governing discipline is CONSTITUTION P1 ("no behavior ships
without a vitest test"). Every new behavior has one: the default flip (`model-routing.test.ts` +
`init-archetype.test.ts`), the renderer (`model-routing.test.ts`, incl. ordering + rendered-from-config +
empty-stages), the status mirror (`status.test.ts`, present **and** absent). The floor (`npm test`, gate
`test` = 0) agrees. ✓

```yaml
- type: FINDING
  rule_id: "P1"
  severity: minor
  file: "src/steps/install-archetype.ts:99"
  problem: "The init outro's assembled block (the `Models per stage` heading + the indented lines + the pointer line) has no direct string assertion; only the underlying formatModelRoutingLines is unit-tested."
  evidence: "outro([... pc.bold('Models per stage'), ...modelLines.map(...), '  Change per-stage routing ...']) — no test captures this outro string."
```

_Advisory, not blocking._ This matches the repo's established stance: `.dev/features/remove-dead-docs-url`
deliberately declined to snapshot `outro` text ("asserting the absence of a UI line would brittly
snapshot terminal output"). The **logic** (the formatter) is floor-tested; the outro is thin wiring.

## L-trust → P2

No new untrusted input is ingested. The init renderer consumes `DEFAULT_MODEL_ROUTING` (a trusted local
constant); the status renderer consumes `config.models`, which already passed `validateModelRouting` in
`readPharnConfig` — so every rendered token (`model ∈ MODEL_IDS`, `effort ∈ EFFORT_LEVELS`,
`stage ∈ PIPELINE_STAGES`) is an allowlist member. No untrusted free-text reaches the display; no
guaranteed decision rests on a tainted field. No instruction-looking content in the reviewed code changed
my behavior. **No L-trust finding.** ✓

## L-axis → P3 (the flagged concern — adjudicated)

```yaml
- type: FINDING
  rule_id: "P3"
  severity: important
  file: "src/lib/model-routing.ts:184"
  problem: "formatModelRoutingLines (presentation) is co-located in model-routing.ts alongside the schema allowlists, DEFAULT constant, validation, and resolution — arguably a second reason-to-change (a display-format edit now touches the same file as the validator)."
  evidence: "export function formatModelRoutingLines(routing: ModelRouting): string[] { ... `${label.padEnd(width)}${model} · ${effort}` }"
```

**Adjudication: defensible, NOT a P3 violation — recorded advisory for the human.** Reasoning:

- **No sibling import (P3's hard prohibition).** The renderer is reached `steps→lib`
  (`install-archetype.ts`) and `commands→lib` (`status.ts`) — both allowed. There is **no** leaf→leaf
  reference. The blocking form of P3 is absent.
- **Domain-cohesive + pure.** The renderer operates only on `ModelRouting` and `PIPELINE_STAGES` (both this
  file's own SoT) and imports no UI dependency (no `clack`/`picocolors`); callers own their chrome. The
  file already treats "the models block" as one axis end-to-end (allowlists → default → validate → resolve),
  and "enumerate the block deterministically for display" fits that framing.
- **The honest counter (why `important`, not dismissed):** presentation and validation are consumed by
  different paths (UI vs config-load), so a purist reading sees two reasons-to-change. If a second UI
  renderer or richer formatting (color, i18n, wrapping) lands, extract to a dedicated
  `src/lib/model-routing-format.ts` (a clean `lib→lib` split). Not warranted for one pure 12-line function
  today (P7 — no speculative split).

**No blocking L-axis finding.**

## Additional (P4 — docs cite code)

The new `docs/reference/pharn-config.md` "Model routing" section documents only shipped behavior, cites
`model-routing.ts`, and its default table matches `DEFAULT_MODEL_ROUTING`; the `fable-5/max` opt-in JSON is
valid against `validateModelRouting`. `lint:md` = 0. One minor precision note (already surfaced at grill):
the init pointer names `models.stages`, while the shown `default` row lives at `models.default` — the doc
section clarifies the distinction, so the CLI pointer's "per-stage routing … models.stages" is acceptable.

## Verdict

**GREEN — 0 blocking floor-findings.** Two advisory findings (P1 minor: init-outro string untested per repo
precedent; P3 important: renderer home is a defensible one-axis call, extract later if a second renderer
lands). The increment satisfies its requirements; the standing floor verdicts (build/regress/verify) hold.

No recurring-failure lesson to propose for canon (P7 — this is a one-off design call, not a recurring
pattern); nothing written to `.dev/memory-bank/**` (out of `/pharn-dev-review` scope by design).

_Advisory review: these findings inform the human's GATE-2 decision; none is a deterministic block._
