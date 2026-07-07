# PLAN — add-archetype-aware (slice 4/5: archetype-aware `pharn add`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn add <name>` / `add <role>:<name>` installs one capability into an archetype project (a manual override of archetype auto-selection), instead of crashing on the absent manifest.
- layer(s): product (`src/`).
- constitution_refs: [P2, P3, P5, P6, P7]

## Files

- `src/lib/install-capabilities.ts` — **EDIT (DRY)** — extract + export `installCapabilityDirs(repoDir,
  projectRoot, capabilities)`: the pre-flight + per-capability dir copy (validated name + safeJoin), WITHOUT
  the fixed product surfaces. `installCapabilities` calls it for its capability step (behavior unchanged).
  Gives `add`/`remove` a focused primitive.
- `src/commands/add.ts` — **EDIT** — branch on `isArchetypeConfig` **before** `loadManifest` → `runArchetypeAdd`:
  require an arg (`<name>` or `<role>:<name>`); `fetchRepo` → `parseCapabilityIndex` → resolve the arg to a
  capability (`role:name` explicit, else search by name; ambiguous → ask for `role:name`; unknown → list valid
  addresses); already-installed → no-op; else `installCapabilityDirs` the one cap → append to
  `config.capabilities` (never touching `archetypes`) → rewrite config (skillsVersion via `readSkillsVersion`,
  commit). Legacy module/skill paths unchanged.
- `tests/install-capabilities.test.ts` — **EDIT** — `installCapabilityDirs` copies only the named cap dir(s),
  no product surfaces; rejects a `..` name (safeJoin).
- `tests/add.test.ts` — **EDIT** — archetype add: `add a11y` installs + appends config; unknown → exits with
  the valid list; already-installed → no-op; legacy path unchanged (regression guard).

## Contracts satisfied

- **`ARCHITECTURE.md §5`** — `add` is the manual capability-install override for an archetype project. Cited (P4).

## Evals to write (P1)

- `installCapabilityDirs` ⇒ copies `pharn-review/<name>/…`, does NOT write `.claude/commands/*`; `..` name throws.
- archetype `add a11y` ⇒ `installCapabilityDirs` called with the resolved cap; config.capabilities appended;
  config.archetypes untouched.
- archetype `add unknown` ⇒ exit 1 listing valid capabilities.
- archetype `add <already-installed>` ⇒ no-op outro, no copy.
- legacy `add <module>` ⇒ unchanged.

## Guarantee audit (P0)

- **"add no longer crashes on an archetype install"** → floor: `isArchetypeConfig` membership routes before
  the manifest path + vitest.
- **"the added capability is path-contained"** → floor: `CAPABILITY_NAME_RE` + `safeJoin` in
  `installCapabilityDirs` + vitest (P2).
- **"resolution is deterministic"** → floor: exact `name`/`role:name` membership over the validated index;
  ambiguous/unknown terminal fallback is **ask/list**, never a guess (P5).

## Trust audit (P2)

Reuses the `capability-index` parse boundary (validated index) + `installCapabilityDirs` (validated name +
safeJoin). The user-supplied `arg` is matched against index names (membership), never path-joined raw.

## Open questions (RESOLVED — pre-authorized)

- Addressing = `<name>` (unique) or `<role>:<name>` (disambiguation); `add` is a manual override that appends
  to `capabilities` and never edits `archetypes`.
