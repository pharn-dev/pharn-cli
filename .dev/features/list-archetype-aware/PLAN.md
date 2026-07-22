# PLAN — list-archetype-aware (shared discriminator + archetype-aware `pharn list`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 — sha256 of ARCHITECTURE.md, read this run
- increment: Add a shared `isArchetypeConfig` discriminator and make `pharn list` render an archetype install's capabilities/archetypes **offline** (no manifest fetch) instead of crashing — **slice 1 of 5** toward full sibling-command archetype parity.
- layer(s): **product** (`pharn` CLI, `src/`).
- constitution_refs: [P3, P4, P5, P6, P7]

## Context (this run, live reads)

- The just-built (uncommitted) `pharn init --archetype` writes a config with `capabilities[]` +
  `archetypes[]` + `modules: []` + no `constitution`. **Live upstream has no `manifest.json`**, so the
  sibling commands crash: `list` (`src/commands/list.ts:37` → `loadManifest` → `fetchRemoteManifest`),
  `status` (`:49`/`:80` fetch/`readManifest`), `update` (`:39` fetch) all die at the manifest read; and
  `config.modules` is `[]` so even a mocked manifest yields an empty, misleading render.
- **Decomposition (proposed; slice 1 built here, 2–5 are follow-ups, confirm at HALT):**
  1. **`list-archetype-aware` (THIS)** — the shared `isArchetypeConfig` discriminator + `list` renders
     installed capabilities/archetypes offline. Smallest, read-only, self-contained (no clone).
  2. `status-archetype-aware` — version (via `SKILLS_VERSION`, not manifest) + capability-aware drift
     (`diffInstalled` already diffs skills; extend to capabilities).
  3. `update-archetype-aware` — re-fetch, re-resolve capabilities against current archetypes + frontmatter,
     re-copy, rewrite config.
  4. `add-archetype-aware` — `add <griller|lens>:<name>` (or `add <capability>`) installs one capability.
  5. `remove-archetype-aware` — remove one installed capability dir + drop its config entry.

## Files

- `src/lib/pharn-config.ts` — **EDIT (additive)** — add `isArchetypeConfig(config: PharnConfig): boolean`,
  a pure deterministic membership test (`Array.isArray(config.capabilities)` — the archetype install
  always writes `capabilities`; a legacy module config never does). One axis (config read/shape helpers)
  unchanged. Layer product.
- `src/commands/list.ts` — **EDIT** — right after `readPharnConfig` and **before** `loadManifest`, branch
  on `isArchetypeConfig`: render an **archetype inventory** (installed grillers/lenses grouped by role +
  detected `archetypes` + `skillsVersion`) built from the **config alone** (no manifest fetch, no clone —
  cannot crash on the missing manifest). `--json` emits an archetype-shaped inventory carrying a
  `mode: 'archetype'` discriminator; the human render shows the capabilities + a dim note that
  cross-checking against upstream (available/updatable capabilities) arrives with the `status`/`update`
  slices (P4 — labeled, not silently missing). The legacy (module) path is **byte-unchanged**. Axis (the
  `list` verb) unchanged — P3.
- `tests/list.test.ts` — **EDIT** — archetype config → renders installed capabilities + archetypes, makes
  **no** manifest fetch (assert `fetchRemoteManifest` not called / no crash), `--json` emits
  `mode:'archetype'` with the capabilities; the legacy module path still renders as before (regression
  guard). Layer product (vitest = the spec, P1).
- `tests/pharn-config.test.ts` — **EDIT** — `isArchetypeConfig`: true for a `capabilities`-bearing config,
  false for a legacy module config and for a `capabilities`-absent config.

Nothing else is touched. `status`/`update`/`add`/`remove` stay **byte-unchanged** this increment (they
still error on an archetype config until their own slices land — an honest, labeled limitation, P7, not a
silent regression: they were already non-functional against live upstream).

## Contracts satisfied

- **`ARCHITECTURE.md §5`** (archetype + capability model) — `list` becomes the first read surface over an
  archetype install's recorded capabilities/archetypes. Cited, not restated (P4).
- **CLI-owned `pharn.config.json` schema** — `isArchetypeConfig` reads the additive `capabilities` field
  this CLI owns (`ARCHITECTURE.md §4` ownership boundary; the shape was defined in `init-install-capabilities`).

## Evals to write (P1 — vitest is the spec)

- `isArchetypeConfig` → `{capabilities:[…]}` ⇒ true; legacy `{modules:[…], constitution}` ⇒ false;
  `{modules:[]}` with no `capabilities` ⇒ false (empty modules alone is NOT the marker).
- `runList` archetype config ⇒ renders each installed capability (name + role) + `archetypes` +
  `skillsVersion`; **`fetchRemoteManifest` is never called**; no throw.
- `runList --json` archetype config ⇒ a `mode:'archetype'` object listing the capabilities (stdout pure).
- `runList` legacy config ⇒ unchanged module/skill render (the fetch path still taken) — regression guard.

## Guarantee audit (P0)

- **"`list` no longer crashes on an archetype install"** → **floor: membership test (`isArchetypeConfig`)
  routes before the fetch** + vitest asserting no fetch + no throw. Deterministic branch (P5).
- **"`isArchetypeConfig` is deterministic"** → **floor: pure `Array.isArray` membership + vitest.**
- **"the archetype `list` output is complete/authoritative vs upstream"** → **NOT claimed — advisory /
  Coming soon.** Slice 1 is an **offline** inventory from the config; cross-checking installed vs upstream
  (available/updatable) is explicitly deferred to the `status`/`update` slices and **labeled** in the
  output (P4/P7). No guarantee is sold over the deferred part.

## Trust audit (P2)

No new untrusted ingestion: slice 1 reads only the **local** `pharn.config.json` (this CLI's own schema)
and renders it. It makes **no** network fetch and **no** clone on the archetype path, so no fetched
frontmatter/file is parsed here (that boundary stays in `capability-index.ts`/`install-capabilities.ts`
from the prior increment). `readPharnConfig`'s existing light shape-guard still applies.

## Open questions (RESOLVED at GATE 1)

1. **Decomposition + slice-1 scope** — RESOLVED (human approved via "continue"): slice 1 = the shared
   discriminator + archetype-aware `list` only; `status`/`update`/`add`/`remove` are separate follow-up
   increments.
2. **Archetype `list` "available" section** — RESOLVED (installed-only, offline): slice 1 shows installed
   capabilities + archetypes from the config alone (no clone) + a Coming-soon note for the upstream
   cross-check.
