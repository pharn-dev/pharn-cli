# PLAN — seam-config-validator

- spec_content_hash: 11cd9ad5983188623fe0931d13588c16435a5565888344e20669748947d1d969 # fix #4 — sha256(ARCHITECTURE.md), this run
- increment: Introduce the seam-resolution **config schema** (a `pharn-contracts` contract) and its **deterministic floor validator** (`.dev/floor/check-seam-config.mjs`), guaranteeing that a seam config's `resolutionOrder` always retains a terminal `ask` and uses only valid steps — the floor slice of ARCHITECTURE §5's confidence-gated chain.
- layer(s): pharn-contracts (L-1, the schema) + .dev/floor (build apparatus, the checker) # ARCHITECTURE.md §4
- constitution_refs: [P0, P2, P3, P4, P5, P6, P7]

## What this increment deliberately is (and is NOT)

**IS:** the smallest coherent, spec-consistent, floor-reducible slice of "the seam-resolver": the
**config contract** (what a valid seam config looks like) + a **deterministic validator** that
enforces the one non-negotiable invariant — _`ask` is never removed_ — plus valid-step and
well-typed-field checks. It mirrors the established `finding-shape.md` (schema) ↔
`check-provenance.mjs` (validator) pair exactly.

**IS NOT (deferred, see Open Questions):**

- the **runtime resolution MECHANISM** (walk the list, stop at first hit, confidence-gate at `model`,
  terminal `ask`). ARCHITECTURE §4 places that in `pharn-core` ("the seam-resolver (the MECHANISM,
  agnostic)"), which **does not exist yet** (`README.md:157` — pharn-core is "planned, not built").
  The mechanism is the _agent following an ordered instruction at runtime_ — **advisory**, not floor
  — so shipping it is a separate increment gated on a real trigger (P7).
- the **`pharn.config.json` file** and the **wizard** that writes it. Neither exists, and neither is
  named in ARCHITECTURE (verified this run: `grep haltOnUnknown|resolutionOrder|pharn.config` → only
  `README.md:161`, which says installer/wizard **do not exist**). This increment defines the config
  _shape_; it does not invent the file or its writer.

## Files

- `pharn-contracts/seam-config.md` — schema-only contract (no `role:`, zero behavior) defining the
  seam-config object, the `resolutionOrder` step enum, the terminal-`ask` floor invariant, and the
  guarantee audit — layer **pharn-contracts (L-1)**. Mirrors `pharn-contracts/finding-shape.md`.
- `.dev/floor/check-seam-config.mjs` — the deterministic validator (Node stdlib, dependency-free,
  top-level-exec). Reads a seam-config JSON; RED (exit 1) unless it is well-shaped. Mirrors
  `.dev/floor/check-provenance.mjs` — layer **build apparatus** (`.dev/`, excluded from `validate.mjs`).
- `.dev/floor/check-seam-config.test.mjs` — black-box subprocess tests (temp-dir fixtures, no
  committed fixtures), mirroring `check-provenance.test.mjs`. Auto-discovered by `npm test`'s glob
  (`package.json:28`); this **is** the checker's spec (see Evals below).

## What the validator checks (deterministic; every branch a membership/type/presence test — P5)

Given a seam-config JSON object `{ resolutionOrder, modelConfidenceThreshold?, haltOnUnknown? }`:

1. input is a JSON **object** (not array/scalar) — else RED (fail-closed).
2. `resolutionOrder` is a **non-empty array** — else RED.
3. **every** element ∈ `STEP_ENUM = ["official-skill","pinned-docs","fetch","model","ask"]` — else RED
   (names an invalid/unwalkable step). The enum set == ARCHITECTURE §5's chain sources
   (`pinned-docs` ≡ "pinned ai_docs"; `fetch` ≡ "fetch+pin"); cited in the contract, not restated (P4).
4. `resolutionOrder` **contains `"ask"`** — else RED. **This is the floor invariant** (the config
   cannot remove the terminal fallback → ARCHITECTURE §5 "terminal fallback is **ask**, P5").
5. `modelConfidenceThreshold`, **if present**, ∈ `{"low","medium","high"}` — else RED.
6. `haltOnUnknown`, **if present**, is a **boolean** — else RED.

Design decision (stated, justified): the floor invariant is **`ask` PRESENT**, not "`ask` is last."
Rationale — `ask` always resolves (a human answers), so once the walk reaches it, it stops; presence
therefore guarantees termination (no fall-through-to-hallucination) regardless of position, and the
confidence-gate skips a low-confidence `model` toward `ask`. The **only** unsafe config is `ask`
_absent_ — exactly what step 4 rejects. "`ask` should be last" is a quality lint (unreachable steps
after `ask` are wasteful, not unsafe) → advisory, not floor.

## Contracts satisfied

- `pharn-contracts/seam-config.md` — **created here** as the SoT for the seam-config shape; the
  validator **cites** it (P4) and conforms to it, never restating its semantics. Elaborates
  ARCHITECTURE §5 (the confidence-gated chain) + §2 (floor primitive #3, enum/presence). Same
  schema↔enforcer relationship as `finding-shape.md` ↔ `check-structural.mjs`.

## Evals to write (P1)

Neither file is a **role-bearing Capability** (the contract has no `role:`; the floor checker is a
non-LLM program, `ARCHITECTURE.md §3.3`), so P1's "every Capability ships `evals/cases` +
`evals/expected`" **does not bind** here — exactly as it does not bind `check-provenance.mjs`,
`check-structural.mjs`, or any `.dev/floor/check-*.mjs`. `validate.mjs` requires evals **only** for
`role:`-bearing files, and this increment adds none (it stays "1 capabilities checked" GREEN). The
checker's specification is its black-box `.test.mjs` suite:

- valid config (order with `ask`, valid steps) → **GREEN** (exit 0).
- `resolutionOrder` **missing `ask`** → RED — the core floor case.
- an **invalid step** (`"modell"`) in `resolutionOrder` → RED.
- `resolutionOrder` **not an array** / **empty** → RED (fail-closed).
- `modelConfidenceThreshold` outside `{low,medium,high}` → RED.
- non-boolean `haltOnUnknown` → RED.
- non-JSON-object input → RED (fail-closed).
- **`ask` present but not last** (e.g. `["ask","official-skill"]`) → **GREEN** (documents the
  presence-not-last-ness decision above).
- **★ P2 needle:** an instruction-looking string in an **unchecked** field (e.g. a `comment`) does
  **not** move the verdict (stays GREEN) — proves the verdict ranges only over enum/type-checked
  fields, never free-text (mirrors `check-provenance.test.mjs`'s ★ test).

## Guarantee audit (P0)

- "A seam config's `resolutionOrder` always retains a terminal `ask` (the config **cannot** remove the
  final fallback)" → **floor: enum/presence check** (`check-seam-config.mjs` step 4; primitive #3).
- "Every step in `resolutionOrder` is a valid, walkable step" → **floor: enum membership** (step 3).
- "`modelConfidenceThreshold` / `haltOnUnknown`, when present, are well-typed" → **floor: enum/type
  check** (steps 5–6).
- "The resolver **resolves the seam correctly** at runtime (right source; the model's knowledge is
  accurate at the `model` step)" → **ADVISORY** — model judgment, backstopped by the confidence-gate
  (skip-if-not-confident) + terminal `ask`. The validator does **not** and **cannot** guarantee this.
- "The deterministic **walk** (stop at first hit → next → terminal `ask`) is executed faithfully at
  runtime" → **ADVISORY** — the future `pharn-core` mechanism (the agent following an ordered
  instruction). Only the **config validity that makes a safe walk possible** is floor.

Net (the honest boundary the request itself named): this increment guarantees the **config is valid**
(ask-terminal + walkable steps, deterministic) — it does **not** guarantee the model **resolves
correctly**. "check-seam-config passed" must never read as "the seam was resolved right" (the P0
disease).

## Trust audit (P2)

A seam config can originate in **untrusted** input (a forked/poisoned repo — THREAT-MODEL §2 items 2
& 5, seam-resolver fetch fallback / seam-record poisoning). The validator's verdict ranges **only**
over enum-gated / type-checked fields (`resolutionOrder` steps ∈ enum, `ask` presence, threshold enum,
boolean type) — **never** over any free-text. A poisoned config can therefore only: (a) name an
invalid step → RED, (b) drop `ask` → RED, or (c) inject a free-text field → **ignored** (unread by the
verdict). Taint cannot flip the verdict through free-text — the ★ P2 test proves it. Identical
posture to `check-provenance.mjs` (the config's free-text is DATA, never an instruction).

## Determinism audit (P5)

Every branch is a membership / type / presence test; the terminal fallback on any non-member is a
loud **RED**, never a guess. Doubly P5: the artifact being validated (the resolver config) is itself
required by the floor to keep a terminal **ask** — so both the checker and the thing it checks end
their fallback chains at "ask / RED," never at a guess.

## Open questions — RESOLVED at GATE 1 (human approved "as written", 2026-07-03)

All three were resolved by the human taking the recommended option (A/A/A); **none remain open**, so
`/pharn-dev-build`'s open-questions gate is satisfied. The plan body already reflects these decisions.

- **Q1 (default order) → RESOLVED:** match ARCHITECTURE §5 — default
  `[official-skill, pinned-docs, model, fetch, ask]` (model before fetch). Users may reorder in their
  own config. (Grill surfaced the configurability/extra-fields as a §5 extension — advisory; noted for
  eventual human reconciliation of §5, which I cannot edit.)
- **Q2 (scope) → RESOLVED:** floor slice only (contract + validator + test); the `pharn-core` runtime
  mechanism is deferred to a future, trigger-driven increment.
- **Q3 (schema home) → RESOLVED:** schema-only contract (`pharn-contracts/seam-config.md`); no concrete
  `pharn.config.json` / example file.

_Original questions + rationale retained below for the audit trail (historical; not open)._

1. **Default `resolutionOrder` conflicts with ARCHITECTURE §5 (a doc-vs-request conflict).**
   ARCHITECTURE.md §5 (line 170, human-only — I cannot edit it) states the chain as
   `official skill → pinned ai_docs → **model → fetch+pin** → ask` (**model before fetch**). The
   request's default swaps to `… → **fetch → model** → ask` (**fetch before model**, "fresh docs beat
   stale training"). The floor doesn't care about order (only `ask`-presence), but the **shipped
   default** must be chosen, and it currently contradicts the trusted spec. Which default ships?
   _Recommend: match the spec (`model` before `fetch`); users reorder in their own config — that is
   what configurability is for; flag §5 for human reconciliation only if fetch-first should become
   canonical._

2. **Increment scope — floor slice only, or also stand up the `pharn-core` mechanism?**
   The floor slice (contract + validator) delivers the guarantee. The runtime **walk** behavior would
   be a `role: skill` Capability in `pharn-core`, which does not exist yet, and no dogfood/eval
   **failure** has triggered it (P7 — the repo is at attempt 0; this increment is human-directed
   spec-building, not failure-triggered). _Recommend: floor slice only now; defer the pharn-core
   mechanism to its own increment when triggered._

3. **The seam-config schema's home / concreteness.** `pharn.config.json` and its wizard do not exist
   and are not in the spec. _Recommend: a **schema-only contract** (`pharn-contracts/seam-config.md`)
   defining the shape, with the validator ranging over any conforming JSON (test fixtures) — do **not**
   also create a concrete `pharn.config.json` / example file at the root (that presumes the unbuilt
   config-file + wizard subsystem)._

## Approval

**APPROVED at GATE 1** — human: "approve as written" (2026-07-03), taking all three recommendations
(A/A/A). Under `/pharn-dev-ship`, the chain continues `/pharn-dev-grill` (done, advisory) →
`/pharn-dev-build` → `/pharn-dev-regress` → `/pharn-dev-verify` → `/pharn-dev-review`, stopping again for the
human's merge decision at GATE 2. The grill's minor testability suggestion (optional-field-absent GREEN
cases) is folded into the in-scope `check-seam-config.test.mjs`.
