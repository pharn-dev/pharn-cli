# REVIEW — model-routing-config

- Increment: the `models` block in `pharn.config.json` (per-stage `{model, effort}` + `default` fallback), its validator + resolver (`src/lib/model-routing.ts`), types (`src/types.ts`), and init-write in both install paths.
- **Floor first (P0):** `node .dev/floor/validate.mjs .` = **GREEN** (exit 0). The floor is the only guaranteed part of this review; everything below is **advisory**.
- Standing floor verdicts this chain: build `npm run check` GREEN + `validate` 0; regress `no-regressions`; verify `PASS`.

## The four lenses

### L-floor → P0 — CLEAN

Every guarantee reduces or is labeled: rejection of bad model/effort/stage → **enum membership** (`MODEL_IDS`/`EFFORT_LEVELS`/`PIPELINE_STAGES`, floor); `missing stage → default` → **deterministic membership + fallback** (P5, floor); `init writes defaults` → **vitest** assertion (floor). The one thing that could masquerade as a guarantee — "routing changes which model runs a stage" — is explicitly carved out as **advisory / deferred** (subagent generation), not smuggled in. No unlabeled guarantee. No floor-gate finding.

### L-eval → P1 — CLEAN

Product TypeScript → the `vitest` suite is the spec. Every behavior has ≥1 test: the validator (valid / stages-omitted / empty-stages / bad-model / bad-effort / unknown-stage / wrong-type / missing-default / non-object-stages / all-models×efforts / all-stages), the resolver (entry-present / missing→default / empty-stages→all-default), `DEFAULT_MODEL_ROUTING` (valid + keys ⊆ enums), and the init-write on **both** paths (`install.test.ts`, `init-archetype.test.ts`). No missing binding; the floor (`test` gate) agrees.

### L-trust → P2 — CLEAN

The increment emits no findings/free-text. The `models` block (hand-editable, semi-trusted) is **enum-validated before any use**, and this increment does **no path-join / no exec** over its values. Prototype-pollution surface checked: an attacker key like `__proto__` in `stages` fails `PIPELINE_STAGES.includes(...)` → rejected before any assignment into the freshly-constructed `stages` object. No instruction-looking content in the reviewed code changed reviewer behavior. No guaranteed decision rests on a tainted field.

### L-axis → P3 — CLEAN

`model-routing.ts` = one cohesive axis (the model-routing config block: enums + default + validate + resolve, all changing together with the schema). `types.ts` additive vocabulary; the two `steps/*` each gained one field on their existing config-construction axis. Only sibling reference is `model-routing.ts` → `validate.ts` `isPlainObject` — a shared **lib** primitive (the same lib→lib use `pharn-config.ts` already makes), not a command→command / step→step / leaf→leaf import. Clean.

## Findings — floor-gate (blocking)

**None.** The floor is GREEN and no lens found an unlabeled guarantee, missing eval binding, tainted-field gate, or sibling import.

## Findings — advisory (inform; never a blocking basis)

```yaml
- type: FINDING
  rule_id: P7
  severity: important
  file: src/lib/model-routing.ts:1
  problem: "'bad → reject' ships as a validator function but no shipped read path (e.g. readPharnConfig) invokes it, so a hand-edited invalid models block on disk is not rejected by any command this increment ships — realization is deferred with the (not-yet-built) subagent-generation consumer."
  evidence: "validateModelRouting is exported + fully tested; readPharnConfig was intentionally left unchanged (it returns null on bad shape and is shared by add/update/status/list)."
```

```yaml
- type: FINDING
  rule_id: P5
  severity: minor
  file: src/lib/model-routing.ts:129
  problem: "resolveStageModel reads routing.stages[stage] assuming stages is always present (guaranteed for validated/typed routings); a caller passing an unvalidated routing with stages undefined would throw rather than fall back to default — optional chaining (routing.stages?.[stage]) would harden this for free."
  evidence: "return routing.stages[stage] ?? routing.default;"
```

Both are **advisory** (they rest on judgment / a deferred-consumer decision), consistent with GRILL.md. The P7 one is the standing item for the human's GATE-2 decision; the P5 one is optional hardening.

## Proposed lesson for canon (NOT written here — P2)

No new recurring failure surfaced that isn't already captured (the increment cleanly followed the established product-TS pattern: types.ts vocabulary + lib/ logic + vitest spec + additive `pharn.config.json` field). **No `/pharn-dev-memory-promote` candidate proposed.**

## Verdict

**GREEN — no floor-gate (blocking) findings.** 2 advisory findings (1 important, 1 minor) for the human to weigh. This verdict is **advisory**: `/pharn-dev-review` has no structural gate; the guaranteed part of this review is only the floor-first `validate.mjs` GREEN. The merge/fix/abandon decision is the human's at GATE 2.
