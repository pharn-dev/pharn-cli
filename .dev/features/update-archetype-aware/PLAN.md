# PLAN — update-archetype-aware (slice 3/5: archetype-aware `pharn update`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: Make `pharn update` refresh an archetype install to the latest upstream — re-resolve the recorded archetypes against the current capability index and re-copy — instead of crashing on the absent manifest.
- layer(s): product (`src/`).
- constitution_refs: [P2, P3, P5, P6, P7]

## Files

- `src/commands/update.ts` — **EDIT** — branch on `isArchetypeConfig` → `runArchetypeUpdate`: version check via
  `fetchRemoteSkillsVersion` (up-to-date → outro, no clone); else `note` the version bump + `confirm`; on yes,
  `fetchRepo` → `parseCapabilityIndex` → `resolveCapabilities(config.archetypes, index)` (re-resolve the
  **recorded** archetypes, mirroring legacy update's "re-resolve recorded modules") → `installCapabilities`
  (re-copy) → rewrite config (new `skillsVersion` via `readSkillsVersion`, `commit`, `capabilities`), cleanup
  in `finally` with exits after. Legacy path unchanged. Reuses init/status plumbing entirely.
- `tests/update.test.ts` — **EDIT** — archetype config: up-to-date short-circuits (no clone); a version bump
  re-resolves + re-copies + rewrites config; decline cancels; legacy path unchanged (regression guard).

## Contracts satisfied

- **`ARCHITECTURE.md §5`** — update refreshes the archetype install's capabilities to the latest upstream.
  Cited (P4).

## Evals to write (P1)

- archetype config, `skillsVersion === latest` ⇒ "already up to date", `fetchRepo` NOT called.
- archetype config, version behind + confirm yes ⇒ `installCapabilities` called, config rewritten with the
  new skillsVersion + re-resolved capabilities.
- decline ⇒ `cancelAndExit`, no copy.
- legacy config ⇒ unchanged module-update path (regression guard).

## Guarantee audit (P0)

- **"update no longer crashes on an archetype install"** → floor: `isArchetypeConfig` membership routes
  before the manifest path + vitest.
- **"re-resolution is deterministic"** → floor: the pure `resolveCapabilities` membership over the validated
  index + vitest.
- Remote fetch guarded → floor: `fetchRemoteSkillsVersion`/`fetchRepo` reuse the existing guards.

## Trust audit (P2)

Reuses the `capability-index` parse boundary (validated index) + `installCapabilities` (safeJoin-guarded copy)
+ `readSkillsVersion` (VERSION_RE) from prior slices — no new untrusted ingestion path.

## Open questions (RESOLVED — pre-authorized "build all remaining slices")

- Update re-resolves the **recorded** `config.archetypes` (not re-detected), mirroring legacy update's
  re-resolve-recorded-modules; capabilities no longer selected are dropped from config (files left, as legacy
  update leaves dropped-skill files — pruning is `remove`'s job, slice 5).
