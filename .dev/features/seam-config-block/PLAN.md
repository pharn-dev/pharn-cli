# PLAN — seam config block + CLI validator

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Add a CLI-owned `seam` block to `pharn.config.json` (schema + `DEFAULT_SEAM_CONFIG`) and a runtime validator that conforms to `pharn-contracts/seam-config.md`, mirroring the `model-routing.ts` pattern; `init` writes it on every fresh install.
- layer(s): `src/types.ts` (pharn.config.json schema — CLI-owned, P3) · `src/lib` (the seam-config validator axis) · `src/steps` (init apply). Contract layer: `pharn-contracts` (L-1). # ARCHITECTURE.md §4
- constitution_refs: [P0, P1, P2, P3, P5, P6, P7]

## Scope decisions (resolved at plan time, P6)

Two increment-vs-contract conflicts were surfaced and resolved by the human toward the **trusted
contract** `pharn-contracts/seam-config.md` (SoT) + the existing floor validator
`.dev/floor/check-seam-config.mjs`:

- `modelConfidenceThreshold` enum = **`{low, medium, high}`** (not the increment's `{low, high, max}` —
  that is `EFFORT_LEVELS` from `model-routing.ts`, an accidental carry-over).
- default `resolutionOrder` = **`["official-skill","pinned-docs","model","fetch","ask"]`** (model
  before fetch — the canonical §5 order).

Net: the CLI validator is a faithful runtime mirror of the contract + floor check. **No trusted file
is edited; no pinned contract is broken (P7).** This increment is the **config shape + validator
only** — the runtime resolver that _walks_ `resolutionOrder` is a future `pharn-core` capability
(per the contract's guarantee audit), out of scope here.

## Files

- `src/lib/seam-config.ts` — NEW. `RESOLUTION_STEPS`, `SEAM_CONFIDENCE_LEVELS` (runtime allowlists,
  `satisfies` the type unions), `DEFAULT_SEAM_CONFIG`, `SeamConfigError`, `validateSeamConfig`. Mirrors
  `model-routing.ts` (typeof-guard + enum-membership; fail-closed; names the offender). One axis (P3):
  the seam-config validator.
- `src/types.ts` — add `ResolutionStep`, `SeamConfidence`, `SeamConfig` (interface) and
  `seam?: SeamConfig` on `PharnConfig`. Additive/optional (P7), mirroring the `ModelRouting` block +
  its comment.
- `src/lib/pharn-config.ts` — in `readPharnConfig`, add `if (raw.seam !== undefined) validateSeamConfig(raw.seam);`
  (mirrors the existing `raw.models` guard at lines 28–30): a present-but-invalid `seam` makes the
  config unloadable (→ null → "run init"); an absent `seam` is legacy/valid.
- `src/steps/install.ts` — add `seam: DEFAULT_SEAM_CONFIG` to the written `configFile` (mirrors
  `models: DEFAULT_MODEL_ROUTING`, line 82). The wizard/legacy install writes it on every fresh install.
- `src/steps/install-archetype.ts` — add `seam: DEFAULT_SEAM_CONFIG` to the written `config` (mirrors
  `models: DEFAULT_MODEL_ROUTING`, line 68). The archetype install writes it too.
- `tests/seam-config.test.ts` — NEW. Mirrors `tests/model-routing.test.ts` (accept/reject matrix +
  DEFAULT validity + the P2 "needle in an unchecked field" case + reorder-preserved).
- `tests/pharn-config.test.ts` — add: round-trips a config carrying a valid `seam` block; returns null
  when the `seam` block is invalid (hand-edited, `ask` removed).

Non-goals (P7, explicit): `add`/`update`/`remove` config-write behavior for `seam` is **not** changed —
it mirrors exactly what those verbs already do for `models` (they were out of scope for the `models`
increment too). No runtime seam resolver/walk. No edits to `pharn-contracts/seam-config.md`,
`.dev/floor/check-seam-config.mjs`, or any trusted/floor artifact.

## Contracts satisfied

- `pharn-contracts/seam-config.md` — the CLI's `validateSeamConfig` + `DEFAULT_SEAM_CONFIG` **conform**
  to this schema: step enum `{official-skill, pinned-docs, fetch, model, ask}`; the floor invariant
  (`resolutionOrder` non-empty array of enum steps that **contains `ask`**, fail-closed); **presence,
  not last-ness** (`ask` need not be last); optional `modelConfidenceThreshold ∈ {low, medium, high}`
  and `haltOnUnknown: boolean`; canonical default order. Cited, not restated (P4). Consistency with the
  parallel floor validator `.dev/floor/check-seam-config.mjs` is a manual invariant — see Guarantee audit.

## Evals to write (P1)

Vitest, `tests/seam-config.test.ts` unless noted (case → expected):

- `validateSeamConfig(DEFAULT_SEAM_CONFIG)` → no throw; returns it typed (the shipped default is valid).
- full valid config (order + threshold + haltOnUnknown) → returns the typed config.
- `resolutionOrder` only (optional fields absent) → no throw (fields are optional per contract).
- `resolutionOrder` without `"ask"` → throws `SeamConfigError`, message names `ask` (THE floor invariant).
- invalid step (`"modell"`) → throws, message names the value.
- `resolutionOrder` not an array → throws (fail-closed).
- empty `resolutionOrder` `[]` → throws (no terminal `ask`).
- `modelConfidenceThreshold: "max"` (valid model-routing effort, invalid here) → throws naming the value.
- `modelConfidenceThreshold: "medium"` → **accepted** (guards against the `{low,high,max}` mis-spec).
- non-boolean `haltOnUnknown` (`"yes"`) → throws.
- missing/non-object input (`{}`, `null`, `"nope"`) → throws (fail-closed).
- every member of `RESOLUTION_STEPS` accepted as a step; every member of `SEAM_CONFIDENCE_LEVELS`
  accepted as a threshold (allowlist coverage).
- `"ask"` present but NOT last → **accepted** (presence, not last-ness — the contract invariant).
- reorder preserved: a reordered valid `resolutionOrder` validates and is returned in the same order
  (no sort/normalize).
- P2 needle: a config with an instruction-looking extra free-text field still validates (verdict never
  reads free-text).
- `tests/pharn-config.test.ts`: round-trips a config with a valid `seam` block; returns null when the
  `seam` block is invalid (`ask` removed).

## Guarantee audit (P0)

- "A loaded/`init`-written seam config always carries a terminal `ask`" → **floor: enum/membership.**
  `validateSeamConfig` requires `resolutionOrder.includes("ask")` (ARCHITECTURE §2 primitive #3);
  `readPharnConfig` returns null if it throws; `DEFAULT_SEAM_CONFIG` is asserted valid by an eval (P1).
- "Every step is known; `modelConfidenceThreshold`/`haltOnUnknown` are well-typed" → **floor:
  enum/type membership.**
- "`RESOLUTION_STEPS`/`SEAM_CONFIDENCE_LEVELS` stay in lockstep with their `types.ts` unions" →
  **floor: `satisfies readonly …[]` → tsc compile error on drift** (checked by `npm run typecheck`;
  the same lockstep trick `model-routing.ts` uses).
- "The CLI validator's enums equal `pharn-contracts/seam-config.md` + `check-seam-config.mjs`" →
  **advisory.** No automated cross-artifact check exists (the `.mjs` hardcodes its own array; the `.md`
  is prose). It is a **manual** consistency invariant — labeled advisory, not sold as a guarantee. The
  reject-`"max"` / accept-`"medium"` evals lock the CLI side to the contract's enum so drift shows up
  as a failing test, but they do not read the `.mjs`/`.md`.
- "The seam is _resolved correctly_ / the walk runs at runtime" → **advisory / not built (Coming soon).**
  This increment ships config + validator only; the resolver is a future `pharn-core` capability (per
  the contract). Labeled, not half-shipped (P7).

## Trust audit (P2)

- Input ingested: the `seam` block of `pharn.config.json` — a local, user-controlled file that (per the
  contract + `THREAT-MODEL.md §2`) may originate from a forked/poisoned repo. **Untrusted.**
- Taint propagation: `validateSeamConfig`'s verdict ranges **only** over enum-gated / type-checked
  fields (`resolutionOrder` steps ∈ enum, `ask` presence, threshold enum, boolean type). Extra
  free-text fields are **not read by the verdict** (they round-trip through `readPharnConfig` as inert
  data, never executed). No seam value is ever path-joined or drives a filesystem write, so no
  `safeJoin` is required (values are policy, not paths). A poisoned config can only: name an invalid
  step (→ reject → null), drop `ask` (→ reject → null), or add extra fields (→ ignored). **Taint cannot
  flip the verdict.** Same posture as `finding-shape.md` and `check-seam-config.mjs`.

## Determinism audit (P5)

Every branch is a membership / presence / type test (`Array.isArray`, `RESOLUTION_STEPS.includes`,
`resolutionOrder.includes("ask")`, `SEAM_CONFIDENCE_LEVELS.includes`, `typeof === "boolean"`). A
malformed block **hard-fails naming the offender** (fail-closed) — never a silent fallback, never a
classification/guess.

## Open questions (HALT)

- None. Both plan-time conflicts (threshold enum; default order) were resolved toward the trusted
  contract (`{low, medium, high}`; model-before-fetch). Nothing else was ambiguous against live state.
