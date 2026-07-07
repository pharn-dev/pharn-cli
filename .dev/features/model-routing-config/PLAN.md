# PLAN — model-routing-config (per-stage model + effort in pharn.config.json + validator)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — sha256(ARCHITECTURE.md), read this run
- increment: Add a `models` block to the `pharn.config.json` schema (per-stage `{model, effort}` with a `default` fallback), a deterministic **validator** (reject bad model / effort / stage key) and a pure **resolver** (`stage → {model,effort}`, missing → default), and write the block with sensible defaults on `init`.
- layer(s): **product** (`pharn-cli` CLI, `src/`) — NOT a `pharn-*` methodology Capability and NOT an ARCHITECTURE §4 methodology layer. This is installer schema + logic; the CLI owns the `pharn.config.json` schema (P3, CLAUDE.md). Its floor is `npm run check`, not `.dev/floor/validate.mjs` (which walks only `.md` capabilities and excludes `src/`).
- constitution_refs: [P0, P1, P3, P5, P6, P7]

## What this increment IS (and is NOT)

**IS:** the **config block + its validator + its resolver + init writing it with defaults** — exactly the four requirements in the brief:

1. stage without an entry → `default` (resolver);
2. a user may set `stages: {}` + `default` = one model → everything routes to that one model (resolver over empty stages);
3. `init` writes the block with sensible defaults;
4. a validator: valid model strings, valid effort enum `{low, high, max}`, known stage keys — bad → reject.

**IS NOT (deferred — the brief says so):** the **subagent generation** that _realizes_ routing (model+effort in subagent frontmatter). Claude Code has no per-slash-command model override; routing takes effect only once a later increment emits subagents from this config. **This increment makes NO claim that routing changes which model runs a stage** — it defines, validates, and persists the config only (P7, labeled not hidden). No consumer reads `models` yet beyond the tests.

## Grounding established this run (P6 — live reads, not memory)

- `pharn.config.json` does **not** exist in this repo; it is the schema the CLI **writes into a target project**. `src/lib/pharn-config.ts` owns read/write; `src/types.ts` owns the `PharnConfig` shape (types.ts:167–191), which is **additive** (legacy configs omit newer fields — P7).
- **No** `models` / `effort` / routing code exists in `src/` today (`grep` clean) — greenfield.
- Two sites construct a `PharnConfig` and call `writePharnConfig`: `src/steps/install.ts:99` (v1/v2 module/wizard install) and `src/steps/install-archetype.ts:57` (experimental `--archetype` install). Both are one-line additions.
- Product floor = `npm run check` = `format:check && lint && typecheck && test` (package.json). `.dev/floor/validate.mjs` is **GREEN-by-default** for a `src/`-only change (it does not walk `src/`), so for this increment the meaningful gate is the vitest suite + tsc + eslint + prettier — same as the `capability-resolver` increment.
- Existing config-write assertions live in `tests/install.test.ts` (v1/v2) and `tests/init-archetype.test.ts:112` (archetype) — those are the tests to extend. `tests/init.test.ts` **mocks** `runInstall`, so it is not a config-shape site.
- **Enum conventions to mirror** (`src/lib/validate.ts`): `ROLE_VALUES` / `APPLIES_TOKEN_VALUES` are `as const` arrays with `assertRole`/`assertAppliesToken` doing `typeof` + membership + hard-fail-naming-the-offender. This increment mirrors that exactly. `isPlainObject` is exported there and reused.

## Naming-collision note (surfaced, NOT resolved by me — trusted docs are hook-protected)

`ARCHITECTURE.md §3.1` already defines `model_tier ∈ {haiku, sonnet, opus}` as **advisory metadata on a pharn-oss Capability's frontmatter**. That is a **different concept** from this `models` block (versioned model **ids** + an **effort** level, in `pharn.config.json`, owned by pharn-cli). This increment does **not** touch, redefine, or edit `§3.1` / `model_tier` (ARCHITECTURE.md is trusted + hook-protected; I will not edit it). The two coexist on different axes (P3). Named for a human, not merged.

## Files

- `src/types.ts` — **EDIT (additive)** — add the type vocabulary only (no runtime): `EffortLevel` (`'low'|'high'|'max'`), `ModelId` (union — see Open Q2), `PipelineStage` (union — see Open Q1), `StageModel` (`{ model: ModelId; effort: EffortLevel }`), `ModelRouting` (`{ default: StageModel; stages: Partial<Record<PipelineStage, StageModel>> }`), and `models?: ModelRouting` on `PharnConfig` (additive/optional → legacy configs still load, P7). Axis unchanged (shared type vocabulary) — layer **product**.
- `src/lib/model-routing.ts` — **NEW** — the one axis "the model-routing config block": the `as const` runtime allowlists (`MODEL_IDS`, `EFFORT_LEVELS`, `PIPELINE_STAGES`, each `satisfies readonly …[]` against the types.ts unions), the `DEFAULT_MODEL_ROUTING` constant, `validateModelRouting(input: unknown): ModelRouting` (throws `ModelRoutingError`, naming the offender), and `resolveStageModel(routing, stage): StageModel`. Imports `isPlainObject` from `./validate.js` (shared lib primitive — not a sibling command/step, so P3-clean). Layer **product**.
- `src/steps/install.ts` — **EDIT** — add `models: DEFAULT_MODEL_ROUTING` to the v1/v2 `PharnConfig` (steps/install.ts:99). One added field; axis unchanged.
- `src/steps/install-archetype.ts` — **EDIT** — add `models: DEFAULT_MODEL_ROUTING` to the archetype `PharnConfig` (steps/install-archetype.ts:57), so **every** fresh install writes the block consistently (not half-shipped, P7). One added field.
- `tests/model-routing.test.ts` — **NEW** — the spec (P1) for the validator + resolver + defaults constant.
- `tests/install.test.ts` — **EDIT** — assert the v1/v2 written config carries `models` = `DEFAULT_MODEL_ROUTING`.
- `tests/init-archetype.test.ts` — **EDIT** — assert the archetype written config carries `models` = `DEFAULT_MODEL_ROUTING`.
- `src/lib/pharn-config.ts` — **EDIT (GATE-2 fix)** — wire `validateModelRouting` into `readPharnConfig`: a present-but-invalid `models` block makes the config unloadable (return `null`, consistent with the existing shape guard → "run init"); an absent `models` is legacy/valid (P7). Realizes the REVIEW **P7** finding. Axis (config read/write) unchanged.
- `tests/pharn-config.test.ts` — **EDIT (GATE-2 fix)** — cover the read-path validation (valid `models` round-trips; a bad `models` block → `null`; a legacy config with no `models` still loads).

> **GATE-2 follow-up (human-directed, this run).** The two bullets above realize the REVIEW **P7** finding. The already-listed `src/lib/model-routing.ts` + `tests/model-routing.test.ts` additionally realize the REVIEW **P5** hardening: `resolveStageModel` uses optional chaining (`routing.stages?.[stage]`) so an unvalidated routing with absent `stages` resolves to `default` instead of throwing, with a covering test. No trusted doc is edited (hook-protected); `src/lib/validate.ts` is unchanged except being _imported from_.

## The validator + resolver (the reviewable substance — every branch a membership test, P5)

`validateModelRouting(input): ModelRouting` — fail-closed, hard-fail naming the offender:

1. `input` is a plain object (`isPlainObject`) — else reject.
2. `default` present and a valid `StageModel`: `model` is a string ∈ `MODEL_IDS`, `effort` is a string ∈ `EFFORT_LEVELS` — else reject (`default` is required: it is the fallback).
3. `stages`, **if present**, is a plain object; **every key** ∈ `PIPELINE_STAGES` (unknown stage → reject, naming it); **every value** a valid `StageModel` — else reject.

`resolveStageModel(routing, stage): StageModel` → `routing.stages?.[stage] ?? routing.default`. Pure, deterministic: a stage without an entry (including an empty `stages: {}`) resolves to `default`. No branch on anything but map membership.

`DEFAULT_MODEL_ROUTING` (sensible defaults; only deviations from `default` are listed, the rest fall through):

```jsonc
{
  "default": { "model": "sonnet-5", "effort": "high" },
  "stages": {
    "plan":   { "model": "opus-4-8", "effort": "max" }, // hardest reasoning
    "review": { "model": "fable-5",  "effort": "max" }  // cross-model review
  }
}
```

(Exact `MODEL_IDS` / `PIPELINE_STAGES` sets and the default-stage entries follow the Open-Questions answers; the constant is trivially adjusted at build.)

## Contracts satisfied

- **None in `pharn-contracts/`** — it holds only `eval-format.md`, `finding-shape.md`, `seam-config.md`, none of which govern `pharn.config.json`. **pharn-cli owns the `pharn.config.json` schema** (P3, CLAUDE.md); no methodology contract applies. Stated, not fabricated (P4).

## Evals to write (P1 — for product TS, the vitest suite IS the spec)

`tests/model-routing.test.ts`:

- valid routing (full + `stages` omitted) → `validateModelRouting` returns it (pass).
- bad **model** string (e.g. `"gpt-4"`) → rejects, error names the value.
- bad **effort** (e.g. `"medium"` when enum is `{low,high,max}`) → rejects, names it.
- unknown **stage** key (e.g. `"deploy"`) → rejects, names it.
- missing / non-object `default` → rejects (fail-closed).
- `stages` omitted entirely → valid.
- `resolveStageModel`: a stage **with** an entry → returns that entry.
- `resolveStageModel`: a stage **without** an entry → returns `default` (the headline "missing stage → default").
- `resolveStageModel`: `stages: {}` + `default` = `fable-5` → **every** stage returns `fable-5` (the "one model" case).
- `DEFAULT_MODEL_ROUTING` itself passes `validateModelRouting` (defaults are valid by construction).

`tests/install.test.ts` (extend): the v1/v2 written config has `models` deep-equal to `DEFAULT_MODEL_ROUTING`.

`tests/init-archetype.test.ts` (extend): the archetype written config has `models` deep-equal to `DEFAULT_MODEL_ROUTING`.

## Guarantee audit (P0)

- **"Bad model / effort / stage key is rejected."** → **floor: enum membership** (`MODEL_IDS` / `EFFORT_LEVELS` / `PIPELINE_STAGES` `.includes`, ARCHITECTURE §2 primitive #3), hard-fail naming the offender (P5). Backstopped by the vitest cases.
- **"A stage without an entry (incl. empty `stages`) resolves to `default`."** → **floor: deterministic membership + fallback** (`stages?.[stage] ?? default`, P5). Backstopped by vitest.
- **"`init` writes the block with defaults."** → **floor: vitest** asserting the persisted config equals `DEFAULT_MODEL_ROUTING` (P1 behavior guarantee — not a security claim).
- **"Routing changes which model actually runs a stage."** → **advisory / OUT OF SCOPE, NOT claimed.** Realized only by the deferred subagent-frontmatter generation (P7). This increment guarantees the config + its validation, nothing about execution — labeled, not hidden.

## Trust audit (P2)

- **Input:** a hand-edited `models` block in `pharn.config.json` is semi-trusted **local** input. `validateModelRouting` enum-validates every `model`/`effort`/`stage` before any use. This increment performs **no path-join and no exec** over these values (no subagent generation), so the taint has **no filesystem/exec sink here**.
- **Forward obligation (named):** the deferred subagent-generation increment MUST call `validateModelRouting` before writing any `model`/`effort` into frontmatter — enum-gated → floor-safe. Recorded so taint stays contained downstream.

## Determinism audit (P5)

- Validator: three fixed-set membership tests; malformed input hard-fails naming the offending model/effort/stage — never a silent fallback.
- Resolver: `stages?.[stage] ?? default` — membership + a single deterministic fallback; no classification, no guess.

## Open questions — RESOLVED at GATE 1 (human-selected this run; no unresolved HALT)

All three were presented as an interactive multiple-choice form at the plan-approval halt and answered (all recommended). Recorded here as the versioned intent; the constant/enum values below are final for `/pharn-dev-build`.

1. **Known stage-key enum (`PIPELINE_STAGES`)** → **dev-loop stages: `plan, grill, build, regress, verify, review, ship`** (the pharn-dev-\* commands that exist as subagents; includes `review`, a real command; NOT the §6 spine, which drops `review`/adds `spec`).
2. **Valid model-string allowlist (`MODEL_IDS`)** → **the four current short-form ids: `opus-4-8, sonnet-5, fable-5, haiku-4-5`.**
3. **Effort enum (`EFFORT_LEVELS`)** → **`{low, high, max}`** (as the brief specifies; no `medium`).

Approval: **Approve — proceed to build** (GATE 1 passed).

## Absorbed from GRILL.md (advisory, non-blocking)

- **P1 (minor)** — add a validator test for a **wrong-type primitive** value (`model: 123` / `effort: null`) so the `typeof` guard before membership is exercised. Folded into `tests/model-routing.test.ts`.
- **P7 (important)** — "bad → reject" ships as a validator **function**; no shipped read path invokes it this increment (consumption deferred). **Left as-is per the approved plan** (wiring `readPharnConfig` would change its `null`-on-bad-shape contract, shared by add/update/status/list) — surfaced for the human's GATE-2 decision.
- P3/P5/P7 (minor) — two-SoT union/array tradeoff, `DEFAULT ⊆ PIPELINE_STAGES` coupling (test-guarded), and the absent-`models` fallback forward-note: acknowledged; no change this increment.
