# PLAN — list-readable-capabilities

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: Make `pharn list`'s human output render installed capabilities grouped by role, with a per-role count and ONE capability per line (dash-bulleted), replacing today's comma-joined string that re-wraps mid-item inside the clack `note` box at 33 capabilities.
- layer(s): pharn-cli src — `lib/` (shared, pure) + `commands/` (the `list` verb). Note: ARCHITECTURE.md §4's layer tree describes the PHARN **methodology** (pharn-oss), not this installer's source; the installer's layering is governed by CONSTITUTION **P3** (index dispatches; `commands/` own one verb; `lib/` holds shared logic reached from commands — no sibling-leaf imports).
- constitution_refs: [P3, P5, P6, P7, P1, P4]

## Files

- `src/lib/capability-groups.ts` — NEW. Pure, no-I/O, no-clack. Owns the single source of truth for capability role-group **display**: the ordered `ROLE_GROUPS` ([griller→"grillers", lens→"lenses"]) extracted from `capability-picker.ts`, plus `renderCapabilityLines(inv)` — a pure `inventory → string[]` renderer for the `note` body (Skills version / Archetypes rows via existing `row()`, then the CAPABILITIES block). — layer lib (shared).
- `src/lib/capability-picker.ts` — EDIT. Import `ROLE_GROUPS` from `capability-groups.js` instead of its local `const` (behavior-identical refactor; `groupByRole` and everything else unchanged) so the picker and `list` share ONE role-order source (discovery item 3). — layer lib.
- `src/commands/list.ts` — EDIT. `renderArchetypeHuman` builds the `note` body via `renderCapabilityLines(inv)`; trim the long `outro` footer hint to one short sentence that survives a narrow terminal without mid-word breaks. `--json` path and `buildArchetypeInventory` UNCHANGED. — layer commands (the `list` verb).
- `tests/capability-groups.test.ts` — NEW. vitest over the pure renderer (P1). — layer tests.
- `tests/list.test.ts` — EDIT. Extend the human-render assertion to lock the new grouped/dash/count format (keep every existing case, incl. the byte-identical `--json` cases). — layer tests.
- `docs/commands/list.md` — EDIT (P4). Add a short rendered human-output sample showing the grouped format, so the doc cites real behavior. — layer docs.
- `CHANGELOG.md` — EDIT. One `[Unreleased] › Changed` bullet for the readable `pharn list` layout; **no version bump** (per the original ship checklist; added post-approval as a scope amendment — the deliverable was in the human's stated intent). — layer docs.

## Contracts satisfied

- No `pharn-contracts` schema is touched — this is a presentation-only change to an existing verb's human output. The machine contract (`pharn list --json` inventory object) is explicitly held **byte-identical** (only human rendering changes; discovery item 2). Capability `name`/`role` continue to come from `pharn.config.json`, whose schema this CLI owns (P3) and which validated those names at install (`CAPABILITY_NAME_RE`) — `list` ingests no new input.

## Evals to write (P1)

`tests/capability-groups.test.ts` — pure `renderCapabilityLines`:

- grouped by role → griller items appear under a `grillers (N)` header, lens items under `lenses (N)`.
- counts → header count equals the number of items in that role.
- one-per-line → each capability is its own line; no line joins two capability names (assert no line contains `, ` between two names / assert line-count == item-count within a group).
- dash prefix → every capability line is prefixed with the em-dash bullet `— `.
- empty group omitted → a config with only grillers renders NO `lenses` header (and vice-versa).
- stable order → items render in the config's stored array order within a role; roles always griller-before-lens (ROLE_GROUPS), independent of input interleaving.
- no capabilities → renders the `(none)` line under CAPABILITIES, no role headers.
- kv rows preserved → `Skills version` and `Archetypes` lines still present and unchanged in shape.

`tests/list.test.ts` — the command wiring: the `INSTALLED (archetype)` note body contains the grouped/counted/dash lines (not a comma-joined capability string); the `--json` cases stay byte-identical.

## Guarantee audit (P0)

- "`list` never writes / clones / fetches" → **unchanged & still floor-adjacent** — `list.ts` imports no repo/fs-write module; this increment adds only a pure renderer + a doc line, introducing no I/O. (Not a new claim; preserved.)
- "`--json` output is byte-identical across this change" → **floor: test** — the existing `--json` vitest cases assert the exact object; they are kept and must stay green (P1). Not an advisory promise — the test is the proof.
- "capabilities render one-per-line, grouped, counted, dash-bulleted, empty-group-omitted, stored-order" → **floor: test (P1)** — each property is asserted in `tests/capability-groups.test.ts`. The renderer is deterministic (P5): role order is a fixed membership iteration over `ROLE_GROUPS`; within-role order is the config's stored array order — zero classification, no guess.
- "narrow-terminal readability" (no mid-item wrap; trimmed footer) → **advisory** — clack's `note` box wraps by its own width math, which the floor does not model; the change *reduces* wrap risk (one short name per line; a single-sentence footer) but a name longer than the box may still wrap ITS OWN line. Labeled advisory; the guaranteed part (items never JOINED) is the tested one-per-line property above. (P0/P7: the readability improvement is stated as advisory, not sold as a guarantee.)

## Trust audit (P2)

- No new untrusted ingestion. `list` reads only `pharn.config.json` (this CLI's own schema, P3); capability `name`/`role` were `CAPABILITY_NAME_RE`/enum-validated at install. The renderer emits them into terminal text only (never executed, never a path) — no taint path is created or widened.

## Open questions (HALT)

- Bullet glyph: em-dash `— ` (matches the target sketch in the request and the repo's prevailing typographic style). Proceeding with em-dash unless the human prefers en-dash `– ` or a plain `- `.
- Footer wording: trim to one short sentence — proposed `Read-only — nothing changed.` (drops the add/status/update enumeration that caused the mid-word wrap). Confirm at approval.
