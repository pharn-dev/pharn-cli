# PLAN — make the `models` routing block honest (Coming soon, not a working lever)

- spec_content_hash: ee79ebd718cc2b37266bf0897779a6ae4f467d2b8955878f2dec8a6f41293043 # fix #4
- increment: The `models` block is written, validated and displayed, but no installed STAGE consumes it for routing. Mark it **Coming soon** in the reference doc, add one **Planned** roadmap row, and reword the init outro + `status` MODELS note so neither promises an effect that does not happen. Behavior of the writer, the validator and the renderer is unchanged.
- layer(s): `src/steps` (outro copy), `src/commands` (status note copy), `tests`, `docs`
- constitution_refs: [P0, P4, P7]

## Discovery (P6 — read live this run)

- `docs/reference/pharn-config.md:93-97` — "routes each dev-loop stage to a model + effort … edit it in
  `pharn.config.json` and re-run your stages". An operational promise, no **Coming soon** marker.
- `docs/reference/pharn-config.md:23` — the top-level table row: "Per-stage model routing".
- `docs/reference/pharn-config.md:106-127` — the spend rationale + the `fable-5`/`max` "documented opt-in"
  snippet, framed as something you can turn on today.
- `src/steps/install-archetype.ts:119` — the outro hint: `Change per-stage routing anytime in
  pharn.config.json → models.stages`. (FABLE attributes this to `init.ts`; it is NOT there — drift note
  in the spec is correct, the string lives in the outro of `install-archetype.ts`.)
- `src/commands/status.ts:160-167` — `printModelRouting`, a bare `note(...,'MODELS')`, no qualifier.
- **The consumer sweep, re-run live against the local `pharn-dev/pharn-oss` checkout:**
  `grep -rln 'models\.stages' /Users/pgalarowicz/Projects/pharn-oss` → `CHANGELOG.md`, `CLAUDE.md`,
  `.dev/floor/check-config.mjs`, `.dev/floor/check-config.test.mjs`. **Zero product `pharn-*.md`
  commands.** `.dev/` is excluded from a product install by `DEV_COMMAND_PREFIX` /
  `PRODUCT_COMMAND_PREFIX`, and the pharn-layout floor copy is `pharn/floor/`, which has no
  `check-config.mjs`. The finding holds at HEAD.
- `docs/roadmap.md` — **Planned** table has 5 rows; no routing row.
- `docs/commands/init.md:134` — lists `models` as a written field. That sentence is true (it IS written);
  it makes no claim about consumption, so it needs no marker.

## Files

- `tests/init-archetype.test.ts` — pin the NEW outro hint wording and that the old promise is gone — layer `tests`
- `tests/status.test.ts` — pin the qualifier line inside the MODELS note; keep the absent-`models` omission — layer `tests`
- `src/steps/install-archetype.ts` — reword the dim hint (line ~119) — layer `steps`
- `src/commands/status.ts` — append the same one-line qualifier to the MODELS note — layer `commands`
- `docs/reference/pharn-config.md` — **Coming soon** marker + roadmap link; reframe lines 23, 93-97 and the
  `fable-5` snippet as recorded *intent* — layer `docs`
- `docs/roadmap.md` — exactly one new **Planned** row — layer `docs`
- `CHANGELOG.md` — user-visible doc-honesty entry — layer `docs`

## Evals to write (P1)

- The init outro contains the new hint and does **not** contain the old "Change per-stage routing anytime"
  promise. (A negative assertion is the point: the whole increment is the removal of a claim.)
- `status`'s MODELS note contains the routing lines **and** the not-yet-applied qualifier.
- `status` still omits the MODELS note entirely for a config with no `models` block (P7).
- `config.models === DEFAULT_MODEL_ROUTING` and `stages.review === {opus-4-8, high}` stay green — the
  written block is untouched.

## Guarantee audit (P0)

- "the docs no longer promise an effect that does not happen" → **ADVISORY** (prose review + two pinned
  strings). No floor primitive can verify a doc's honesty; the two string pins verify only that the
  specific old sentence is gone from the two CLI-emitted surfaces.
- "the written config is unchanged" → **FLOOR**: the existing `DEFAULT_MODEL_ROUTING` equality assertion.
- "validation still fails loudly" → **NOT TOUCHED** — `model-routing.ts` and its tests are not in `## Files`.
- "routing works now" → **NOT CLAIMED, and that is the entire point of the increment.**

## Trust audit (P2)

No untrusted input is read. The qualifier is a fixed literal; `formatModelRoutingLines` already emits
allowlist-only tokens, and this change appends a constant line beside them — it does not widen what
reaches the terminal.

## Determinism audit (P5)

Copy changes only. `printModelRouting` keeps its single membership test (`config.models === undefined`).

## Out of scope (P7)

- Implementing a routing consumer here or upstream (see the spec's **Upstream coordination**).
- Deleting the block, its writer, `model-routing.ts`, or `model-routing-format.ts`.
- Changing default values, `MODEL_IDS`, or `EFFORT_LEVELS`.
- `docs/commands/status.md` — it does not mention MODELS today; leaving it that way.
- The `seam` block (3.1) and the FABLE 4.8 / 5.4 surface items (already landed).

## Open questions (HALT)

- None.
