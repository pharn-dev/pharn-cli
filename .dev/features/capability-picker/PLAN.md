# PLAN — interactive capability picker for bare `pharn add` / `pharn remove`

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4 (ARCHITECTURE.md)
- increment: In a real terminal, bare `pharn add` / `pharn remove` open a grouped multi-select over available / installed capabilities and run the existing per-name install / remove path for each pick; named-arg and non-TTY behavior are unchanged (non-TTY still errors, never prompts).
- layer(s): CLI `src/lib/` (shared, pure) + `src/commands/` (one verb each) — the CLI's own axis-of-change taxonomy (CONSTITUTION P3). NB: `ARCHITECTURE.md §4`'s tree (`pharn-core`/`pharn-pipeline`/`pharn-review`) is the **pharn-oss product** tree, not this CLI's `src/` layout; this increment is CLI-only and touches no product layer.
- constitution_refs: [P0, P1, P2, P3, P5, P6, P7]

## Context grounded this run (P6)

- **`add` per-name path** (`src/commands/add.ts`): `runAdd(arg)` → `runArchetypeAdd(config, cwd, arg)`; bare `arg === undefined` today = `log.error('Specify a capability…')` + `process.exit(1)` **before any fetch**. Named path fetches once, then `resolveArchetypeAdd(repoDir, sha, config, cwd, parsed, arg)` = `parseCapabilityIndex` + filter + {unknown|ambiguous|noop|install}; install = `installCapabilityDirs(repoDir, cwd, [{name,role}])` + `writePharnConfig({...config, skillsVersion, commit, capabilities:[...existing, cap], installedAt})`.
- **`remove` per-name path** (`src/commands/remove.ts`): `runRemove(arg,_opts)` → `removeCapability(cwd, config, arg)`. **It ALREADY has a no-arg picker** — a single `select` over installed caps, **with NO TTY guard** — then parse/filter/{not-installed|ambiguous} → `rmSync(safeJoin(cwd, subtree/name))` (subtree from `layoutPaths(configLayout(config))`) + `writePharnConfig` dropping the one entry. `--yes/-y` is already a no-op.
- **Shared install core**: `installCapabilityDirs(repoDir, projectRoot, caps[])` accepts an array and **pre-flights every source** (name `CAPABILITY_NAME_RE` + `safeJoin` + existence + symlink-reject) **before any write** — no partial installs. This is the SAME installer the named `add` uses; the picker is sugar over it, never a second installer.
- **clack `@clack/prompts@1.7.0` real API** (verified in `node_modules/@clack/prompts/dist/index.d.mts`): `groupMultiselect<V>({ message, options: Record<groupLabel, Option[]>, required?, selectableGroups?, … })`; `Option` supports `label`, `hint?`, `disabled?`; exports `isTTY(output)` / `isCI()`. **Grouped multi-select IS supported** → group by role natively; no new dependency.
- **Config / index shapes**: installed = `config.capabilities: {name, role:'griller'|'lens'}[]`; index = `CapabilityIndex.capabilities: {name, role, applies}[]`, already enum/regex-validated at the `parseCapabilityIndex` fetch boundary (P2). Init's grouped rendering: `steps/archetype-summary.ts` (grouped `note` lines via `lib/format.ts row()`).

## Files

- `src/lib/capability-picker.ts` — NEW — layer `lib` (pure, no I/O, no clack import). Exports: `interactiveAllowed({stdinIsTTY?, stdoutIsTTY?}): boolean` (= `Boolean(stdinIsTTY && stdoutIsTTY)`); `buildAddSelection(index, installed): {groups: PickerGroups, availableCount, installed}` (available = index − installed by `(name,role)`; grouped `grillers`/`lenses`; empty groups omitted); `buildRemoveSelection(installed): {groups: PickerGroups}` (installed grouped by role). `PickerGroups = Record<string, {value: string /* role:name */, label: string, hint?: string}[]>` — a plain shape that maps 1:1 onto clack `groupMultiselect` options with no clack coupling.
- `src/commands/add.ts` — MODIFY — layer `commands`. Bare `arg === undefined`: `interactiveAllowed(process.std*.isTTY)` false → reworded usage error + `exit(1)` **before fetch**; true → fetch once → `parseCapabilityIndex` once → `buildAddSelection` → availableCount 0 → "all installed", `exit 0` → else `groupMultiselect({required:false})` → empty/cancel → friendly no-op `exit 0` → print an installed-summary + a "will install" line → loop the **existing** `resolveArchetypeAdd` per pick (config threaded in-memory), echo per item like named add → `outro`. Named-arg path byte-identical.
- `src/commands/remove.ts` — MODIFY — layer `commands`. Extract a file-local `deleteCapabilityDir(cwd, paths, target)` (the existing `safeJoin`+`rmSync`) reused by BOTH the named path (byte-identical) and the picker loop. No-arg branch: `installed.length===0` → unchanged message; else `interactiveAllowed` false → reworded usage error + `exit(1)`; true → `groupMultiselect({required:false})` over `buildRemoveSelection` → empty/cancel → no-op `exit 0` → ONE `confirm` listing picks → loop `deleteCapabilityDir` → one `writePharnConfig` dropping all picks → `outro` summary.
- `src/index.ts` — MODIFY — layer `dispatch` (help text only). Update the `add`/`remove` USAGE lines to say "(no arg: pick interactively)" (P4 keeps help in sync).
- `tests/capability-picker.test.ts` — NEW — pure-function unit tests (P1).
- `tests/add.test.ts` — MODIFY — replace the single "no-arg exits(1)" test with: non-TTY no-arg → `exit(1)` **before fetch**; TTY no-arg → picker path (mock `groupMultiselect`) installs the picks & threads config; all-installed → `exit 0` no fetch-install; empty selection → `exit 0` no-op.
- `tests/remove.test.ts` — MODIFY — the existing no-arg `select` tests become `groupMultiselect`+`confirm`; add non-TTY no-arg → `exit(1)` guard; multi-pick deletes each dir + one config write dropping all; empty/cancel → no write.
- `docs/commands/add.md` — MODIFY — document the bare-`add` interactive picker + non-TTY behavior (P4).
- `docs/commands/remove.md` — MODIFY — update the picker section to multi-select + confirm + non-TTY behavior (P4).
- `README.md` — MODIFY — commands table: note bare `add`/`remove` open an interactive picker (the `remove` row already says "pick one interactively"; align `add`).
- `CHANGELOG.md` — MODIFY — `[Unreleased]` entry (Added/Changed). **No version bump.**

## Contracts satisfied

- **No NEW `pharn-contracts` contract.** The picker is CLI-internal UX. It conforms to the existing `<role>:<name>` capability-address grammar (`src/lib/capability-address.ts`) as its option `value`s, consumes the already-validated `CapabilityIndex` (the `parseCapabilityIndex` fetch boundary, P2), and writes only the CLI-owned `pharn.config.json` `capabilities` schema (`src/types.ts`, `docs/reference/pharn-config.md`) — cite, not restate (P4). Ownership axis (P3): unchanged — this CLI owns `pharn.config.json`; pharn-oss owns the capability frontmatter.

## Evals to write (P1) — the CLI's spec is its vitest suite

- `capability-picker` → available = index − installed by `(name,role)` → picks each remaining cap, grouped; a cap installed in one role still offered in the other. → `tests/capability-picker.test.ts`.
- `capability-picker` → grouping: grillers vs lenses split; empty group omitted (e.g. no lenses available → no `lenses` key). → same.
- `capability-picker` → empty states: everything installed → availableCount 0; no installed → remove groups empty. → same.
- `capability-picker` → `interactiveAllowed` truth table: both TTY → true; stdin-only / stdout-only / neither → false. → same.
- `add` → non-TTY bare invocation → `exit(1)` before `fetchRepo`; TTY bare invocation → installs each pick via the existing path & threads config so the final `capabilities` holds all picks; all-installed / empty selection → `exit 0`, no install. → `tests/add.test.ts`.
- `remove` → non-TTY bare invocation → `exit(1)` (no prompt); TTY bare invocation → each picked dir deleted + one config write dropping all; cancel/empty → no write. → `tests/remove.test.ts`.
- Named-arg `add`/`remove` behavior byte-identical → existing tests stay green (regression spec). → `tests/add.test.ts`, `tests/remove.test.ts`.

## Guarantee audit (P0)

- "Non-TTY never opens a prompt" → **floor**: deterministic boolean membership (`interactiveAllowed` = AND of two `isTTY` flags); the else-branch terminal is a hard-fail `exit(1)` message, never a guess (P5). Unit-tested (P1).
- "available = catalog − installed (installed never offered for re-install by `add`)" → **floor**: deterministic set-difference by `(name,role)` membership. Unit-tested.
- "Picker reuses the existing install / remove path, not a second installer/remover" → **advisory**, backstopped by tests (P1): `add`'s picker calls the same `resolveArchetypeAdd`/`installCapabilityDirs`; `remove`'s picker calls the same `deleteCapabilityDir` the named path uses — asserted by `toHaveBeenCalledWith` in the command tests.
- "Named-arg behavior byte-identical" → **advisory**, backstopped by the unchanged existing `add`/`remove` tests staying green (the regression floor, P1).
- "Every fs write from a picked value stays path-contained" → **floor** (unchanged): copies still go through `installCapabilityDirs` (`CAPABILITY_NAME_RE` + `safeJoin` + symlink-reject); deletes through `safeJoin`. The increment adds **no** new write primitive.
- No claim of "the picker guarantees the right capabilities" beyond the deterministic set-difference — selection is the user's; the tool only offers a correct, deterministic menu (P5, terminal = the user picks).

## Trust audit (P2)

- The picker ingests **no new untrusted artifact**. It is strictly downstream of the existing `parseCapabilityIndex` fetch boundary, which already yields a typed `CapabilityIndex` whose `name`/`role` are `CAPABILITY_NAME_RE`/enum-validated. Option labels/values are built from those validated fields (same posture as init's summary), so no raw untrusted frontmatter reaches the prompt or a filesystem write.
- Picked `value`s are `<role>:<name>` strings re-parsed by `parseCapabilityArg` and re-resolved against the validated index (`add`) or `config.capabilities` (`remove`) **before** any fs op; a value outside that set is a defensive skip/no-op, never an unvalidated write. Taint does not widen: the copy/delete paths and their `safeJoin`/regex guards are unchanged.

## Determinism audit (P5)

- Every branch is a membership / boolean / length test: interactive? (boolean AND); availableCount 0? / selection empty? (length); cancel? (`isCancel` membership); each pick re-resolved by set membership. No classification drives a branch.
- Terminal fallbacks end in a hard-fail or the user: non-TTY → `exit(1)` message (not a guess); the named path's unknown/ambiguous handling is unchanged (lists valid addresses / asks to disambiguate). Group order and option order are the index's deterministic order (grillers before lenses), so the same state renders the same menu.

## Open questions (RESOLVED at GATE 1 — human-approved 2026-07-23)

1. **Already-installed rendering in the bare `add` picker → (A) Summary line above, list only available.** Print `Installed (N): …`; the multi-select offers only not-yet-installed (`available`) items. Chosen for robustness + full pure-unit-testability (no reliance on clack disabled-rendering). `buildAddSelection` therefore returns only `available` items as options and the installed summary as data. (Option B — disabled in-list — was rejected.)
2. **`remove.ts` extraction → APPROVED.** Extract a **file-local** `deleteCapabilityDir(cwd, paths, target)` (the existing `safeJoin`+`rmSync`) reused by both the named path and the picker loop; named-arg behavior byte-identical. This is the single within-file structural change.
3. **`add` uses no extra confirm** (multi-select submit is the confirm; additive) — prints a "will install" summary then installs. **`remove` gets ONE `confirm`** before deleting (destructive). Confirmed at GATE 1.
