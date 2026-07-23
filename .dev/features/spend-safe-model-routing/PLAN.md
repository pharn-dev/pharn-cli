# PLAN — spend-safe model-routing defaults + post-install visibility

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # ARCHITECTURE.md, fix #4
- increment: Flip the fresh-install `review` default from `fable-5`/`max` to `opus-4-8`/`high` at its single source of truth, and surface the per-stage routing after install (init outro + `pharn status`) rendered from the actual written config.
- layer(s): CLI src — `lib/` (SoT default + a pure renderer), `steps/` (init outro), `commands/` (status mirror) — CONSTITUTION.md **P3** file-layer model (`index → commands → steps → lib`). NOTE: `ARCHITECTURE.md §4`'s `pharn-contracts/pharn-core/...` layers describe the **installed methodology**, not this CLI's own source; no methodology layer changes.
- constitution_refs: [P0, P1, P3, P4, P5, P7]

## Discovery result (grounded this run — P6)

- **SoT (Discovery 1):** `src/lib/model-routing.ts` → `DEFAULT_MODEL_ROUTING` (:51–57), written into `pharn.config.json` verbatim at `src/steps/install-archetype.ts:68` (`models: DEFAULT_MODEL_ROUTING`). It lives **in this repo** — `install-archetype.ts` imports it locally; there is **no** pharn-oss fetch of the models block. → change belongs here, NOT halted.
- **Init summary (Discovery 2):** the `outro(...)` in `src/steps/install-archetype.ts:83–94` (the "Next steps" path); `config.models` is in scope there (written at :77). A status-like command **exists**: `pharn status` (`src/commands/status.ts`) prints config-derived notes (`printArchetypeVersion` → VERSION note, via `lib/format.ts` `row`).
- **Docs (Discovery 3):** no dedicated model-routing doc/section exists — only a one-line table row in `docs/reference/pharn-config.md:23` and validation-error examples in `docs/troubleshooting.md:93–101`. No doc states `review = fable-5/max` as the default, so there is **no doc contradiction to repair** (P4), only a new section to add. Best-fit existing doc: `docs/reference/pharn-config.md`.
- **Coverage already present:** `tests/init-archetype.test.ts:119` asserts written `config.models` `toEqual(DEFAULT_MODEL_ROUTING)` → the default flip is covered end-to-end automatically. `tests/status.test.ts` exposes `noteBody(title)` → a `note(..., 'MODELS')` mirror is directly assertable.
- **`fable-5` stays a valid model id** (`MODEL_IDS` in `model-routing.ts:24–29`, `types.ts:46`, `troubleshooting.md:93`) — the opt-in path is unaffected. The ONLY "default" reference to change is `model-routing.ts:55`.
- **Prior human decision (constrains Change 2's pointer line):** `.dev/features/remove-dead-docs-url` deleted the `DOCS_URL` constant + post-install "Docs" outro lines with **no replacement URL** ("just remove the URL"). → recommend a **URL-free** pointer; see Open questions.

## Files

- `src/lib/model-routing.ts` — layer `lib`. (a) `DEFAULT_MODEL_ROUTING.stages.review`: `{model:'fable-5', effort:'max'}` → `{model:'opus-4-8', effort:'high'}`; (b) replace the `// cross-model review` comment with the spend rationale (review fans out across lenses → premium × max × fan-out is the worst-case token multiplier; `opus-4-8`/`high` is the spend-safe default; `fable-5`/`max` cross-model review is the documented release-audit **opt-in**, set via `pharn.config.json` → `models.stages.review`; effort calibration is gated on the fan-out cost measurement — **no** speculative knobs added); (c) add a pure renderer `formatModelRoutingLines(routing: ModelRouting): string[]` — `default` first, then each configured stage in `PIPELINE_STAGES` order, one line per configured entry `"<label padded>  <model> · <effort>"` (label width = longest label + gap; no color/clack — pure).
- `src/steps/install-archetype.ts` — layer `steps`. Extend the `outro(...)` with a bold `Models per stage` block built from `formatModelRoutingLines(config.models)` (the just-written config — not re-hardcoded), plus one pointer line: change routing anytime in `pharn.config.json` → `models.stages`. (Renderer imported from `lib/model-routing.js`.)
- `src/commands/status.ts` — layer `commands`. Add `printModelRouting(config)` (renders `note(formatModelRoutingLines(config.models).join('\n'), 'MODELS')`), **guarded by `config.models !== undefined`** (omit on a pre-`models` archetype config — P7 additive/legacy). Call it after the version note in **both** the `--no-drift` and default paths. Read-only; no new I/O.
- `docs/reference/pharn-config.md` — add a short `## Model routing` section: the per-stage defaults (`default` sonnet-5/high, `plan` opus-4-8/max, `review` opus-4-8/high), user-owned after init (edit `models.stages`), the `fable-5`/`max` cross-model **opt-in** for release audits, valid ids/efforts, cite `src/lib/model-routing.ts`. (P4 — cites code; documents only shipped behavior.)
- `tests/model-routing.test.ts` — layer `tests`. (a) assert `DEFAULT_MODEL_ROUTING` exact values: `default`=sonnet-5/high, `stages.plan`=opus-4-8/max, `stages.review`=**opus-4-8/high**; (b) `formatModelRoutingLines`: DEFAULT → exact expected 3 lines; a **non-default** routing → lines reflect the custom model/effort (rendered-from-config, not hardcoded); ordering = `default` first then PIPELINE_STAGES order; default-only routing → single `default` line.
- `tests/init-archetype.test.ts` — layer `tests`. Add one explicit assertion that the written `config.models.stages.review` `=== {model:'opus-4-8', effort:'high'}` (self-documents the spend-safe default alongside the existing `toEqual` at :119).
- `tests/status.test.ts` — layer `tests`. Assert `noteBody('MODELS')` contains the rendered routing (e.g. `review    opus-4-8 · high`) on an archetype config carrying `models`; and that it is **absent/empty** when `config.models` is undefined (the legacy guard).
- `CHANGELOG.md` — under `## [Unreleased]`: `### Changed` (review default fable-5/max → opus-4-8/high; cross-model review now a documented opt-in) + `### Added` (post-install "Models per stage" visibility in init + `pharn status`). No version bump.

## Contracts satisfied

- No `pharn-contracts` schema is touched. The `models` block shape is owned by **this CLI** (`ModelRouting` in `src/types.ts`, validated by `validateModelRouting`), per CONSTITUTION P3 ("this CLI owns the `pharn.config.json` schema") — unchanged here. Cited, not restated (P4).

## Evals to write (P1) — vitest is the spec in this repo

- `DEFAULT_MODEL_ROUTING` → review is opus-4-8/high, plan opus-4-8/max, default sonnet-5/high → the three exact-value assertions above.
- `formatModelRoutingLines(DEFAULT)` → `['default   sonnet-5 · high', 'plan      opus-4-8 · max', 'review    opus-4-8 · high']` (exact) → rendering is correct & aligned.
- `formatModelRoutingLines({default: haiku-4-5/low, stages:{review: fable-5/max}})` → the `review` line reads `fable-5 · max` → proves **rendered-from-config, not hardcoded**.
- Fresh install writes review=opus-4-8/high → `tests/init-archetype.test.ts` (existing `toEqual` + new explicit assertion).
- `pharn status` prints the MODELS block from `config.models`, and omits it when absent → `tests/status.test.ts` via `noteBody('MODELS')`.

## Guarantee audit (P0)

- "Fresh installs write `review = opus-4-8/high`" → **floor: enum-regex + P1 test.** The value is a deterministic constant that `validateModelRouting` accepts (enum membership, primitive #3), asserted exactly in `model-routing.test.ts` and end-to-end in `init-archetype.test.ts`. Not a safety claim over fetched content (constant is local/trusted).
- "`opus-4-8/high` is more spend-safe than `fable-5/max`; cross-model review still has catch value" → **advisory.** A cost/quality judgment, not floor-verifiable; labeled advisory in the code comment + doc, and it gates nothing.
- "The init/status block is rendered from the written config, not hardcoded" → **floor: P1 test.** `formatModelRoutingLines` is a pure function of its `ModelRouting` input; the non-default-routing test proves the output tracks the input.
- "No existing configs are migrated" → **by construction (no guarantee claimed).** No migration code is added; `readPharnConfig`/`writePharnConfig` are untouched; `models.stages` stays user-owned after init (P7).
- Completeness of the default flip → **floor: `grep -rn "fable-5" src` shows only the allowlist entry (`MODEL_IDS`), never a `stages.review` default**, + typecheck/lint green.

## Trust audit (P2)

- **No new untrusted input is ingested.** The init renderer consumes `DEFAULT_MODEL_ROUTING` (a local trusted constant). The status renderer consumes `config.models`, which has already passed `validateModelRouting` inside `readPharnConfig` (`pharn-config.ts:49–50`) — every rendered token (`model` ∈ MODEL_IDS, `effort` ∈ EFFORT_LEVELS, stage ∈ PIPELINE_STAGES) is an allowlist member, so the displayed strings carry no untrusted free-text. Taint surface unchanged.

## Determinism audit (P5)

- `formatModelRoutingLines` iterates the fixed `PIPELINE_STAGES` enum and includes a stage **iff** it is a key of `routing.stages` (membership test); `default` is always first. No classification, no guess.
- The status "show the block?" branch is `config.models !== undefined` (present/absent membership); terminal fallback = omit the note (deterministic), never a guess.

## Open questions — RESOLVED at GATE 1 (no unresolved HALT items)

- **Doc-link format in the init outro pointer line — RESOLVED: option A (URL-free).** At GATE 1 the human approved the plan as written and selected **URL-free**. The init outro pointer line reads `Change per-stage routing anytime in pharn.config.json → models.stages` (no docs URL — honoring the `remove-dead-docs-url` decision); the canonical "Model routing" section lives in `docs/reference/pharn-config.md`. (Option B — a hardcoded GitHub docs URL — was declined.) No open questions remain.
