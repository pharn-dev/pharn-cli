# PLAN — remove-archetype-aware (slice 5/5: archetype-aware `pharn remove`)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `pharn remove <name>` / `remove <role>:<name>` deletes one installed capability dir (no clone, no network) and drops it from config — mirroring the isolated skill-remove — instead of crashing on the absent manifest.
- layer(s): product (`src/`).
- constitution_refs: [P2, P3, P5, P6, P7]

## Files

- `src/lib/capability-address.ts` — **NEW** — `parseCapabilityArg(arg): { name; role?; error? }` — the shared
  `<name>` / `<role>:<name>` parser (P3/DRY; `add` + `remove` both use it, no command→command import).
- `src/commands/add.ts` — **EDIT (DRY)** — use `parseCapabilityArg` from the new lib; drop the private
  `parseCapArg` (behavior unchanged).
- `src/commands/remove.ts` — **EDIT** — branch on `isArchetypeConfig` **before** the skill/module dispatch →
  `removeCapability`: no-arg → picker over installed capabilities; resolve arg against `config.capabilities`
  (ambiguous → ask for `role:name`; not installed → no-op listing installed); delete the isolated dir
  (`pharn-pipeline/grillers/<name>/` or `pharn-review/<name>/`) via `safeJoin`+`rmSync`; drop its
  `capabilities` entry (never touching `archetypes`/`modules`). No clone, no network — mirrors
  `removeSkill`. Legacy module/skill paths unchanged.
- `tests/capability-address.test.ts` — **NEW** — `parseCapabilityArg` name / role:name / bad-role.
- `tests/remove.test.ts` — **EDIT** — archetype remove: deletes the dir + drops config; not-installed no-op;
  ambiguous errors; `..`/escape rejected (safeJoin); legacy paths unchanged (regression guard).

## Contracts satisfied

- **`ARCHITECTURE.md §5`** — `remove` is the inverse of `add` for one capability; isolated-dir delete (no
  merge, so no pruning subtlety). Cited (P4).

## Evals to write (P1)

- `parseCapabilityArg` ⇒ `a11y` → `{name:'a11y'}`; `lens:n-plus-one` → `{name,role:'lens'}`; `x:y` bad role → `{error}`.
- archetype `remove a11y` ⇒ deletes `pharn-pipeline/grillers/a11y/`, drops the config entry, leaves archetypes.
- `remove <not-installed>` ⇒ no-op listing installed, no config write.
- ambiguous name (installed in both roles) ⇒ exit 1 asking for `role:name`.
- legacy `remove <module>` / `<cat:skill>` ⇒ unchanged.

## Guarantee audit (P0)

- **"remove no longer crashes on an archetype install"** → floor: `isArchetypeConfig` membership routes
  before the manifest path + vitest.
- **"the delete is path-contained"** → floor: `CAPABILITY_NAME_RE` + `safeJoin` before `rmSync` + vitest (P2).
- **"resolution is deterministic"** → floor: exact `name`/`role:name` membership over `config.capabilities`;
  ambiguous/unknown terminal fallback is **ask/list**, never a guess (P5).

## Trust audit (P2)

Reads only the local config + filesystem (no network). The user `arg` is matched against
`config.capabilities` (membership) and the deleted path is derived from the validated stored `name` + role,
`safeJoin`-guarded — the raw arg is never path-joined.

## Open questions (RESOLVED — pre-authorized)

- Capability remove is confirmation-free (mirrors `removeSkill`; isolated + re-addable) and touches only
  `capabilities`.
