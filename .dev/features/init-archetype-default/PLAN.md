# PLAN — init: make archetype the default, remove the init-level legacy flow

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: `npx pharn init` (no flag) runs the archetype/capability flow by default; the init-only legacy wizard flow (`runInitLegacy`/`runInitV2`/`loadManifest` and its 9 orphaned step files) is deleted.
- layer(s): pharn-cli product surface (`src/commands/init.ts`, `src/index.ts`, `src/steps/*`) — not a PHARN methodology layer.
- constitution_refs: [P0, P5, P6, P7]

## Discovery findings (live state, this run)

- `src/commands/init.ts:48` — the `opts.archetype` branch calls the **already-complete, self-contained** `runInitArchetype()`; the comment at :45–47 says "legacy … stays the default." `runInit` currently defaults to `loadManifest()` → `runInitV2`/`runInitLegacy`.
- `runInitArchetype` depends only on: `detect-archetype`, `capability-index`, `resolve-capabilities`, `repo`, `archetype-summary`, `install-archetype`, `pharn-config`, `constants`, `banner`, `confirm`, `prereqs.runGitPrereq`, `fresh-check`. **None of these touch `manifest.ts` or the legacy installer.** (`install-archetype` → `install-capabilities.ts`, not `installer.ts`.)
- **The other 5 commands are already dual-path**: `add`/`remove`/`list`/`update`/`status` dispatch on `isArchetypeConfig(config)` first, then fall back to `manifest.ts`/`fetchAndInstall` **for legacy (pre-archetype) configs**. `init` is the only command where legacy is still the *default* (no config exists yet at init time).
- **`manifest.ts` + `install-modules.ts` are NOT removable in this increment** — proven by live imports:
  - `add.ts` + `update.ts` still call `fetchAndInstall` → `installModule`/`installSkills` (`install-modules.ts`) → `readManifest`/`resolveModules` (`manifest.ts`) as their legacy-config fallback.
  - `list`/`status`/`remove`/`diff` read `manifest.ts` for legacy configs.
  - `safeJoin` is **defined in `install-modules.ts:237`** and imported by the *archetype* path (`install-capabilities.ts:2`) + `capability-index`, `layout`, `skills-version`, `diff`, `remove`.
  - Deleting them collides head-on with the documented guarantee (CLAUDE.md): _"Old pinned SHAs (v1) must keep working — never break `pharn update` against them."_ Confirmed by `tests/manifest.test.ts` + `add`/`update`/`list`/`status` tests, which assert exactly this fallback.
- The 9 init wizard step files (`module-select`, `stackpack-select`, `constitution-select`, `multitenant-select`, `mode-select`, `detect`, `wizard-questions`, `summary`, `install`) are imported by **`init.ts` only** (verified) — deleting the legacy init flows orphans them entirely. Each has a companion `tests/<step>.test.ts`.
- Tests asserting the current legacy default: `tests/init.test.ts` (`runInit()` → legacy), `tests/init-v2.test.ts` (`runInit()` → v2 wizard), `tests/index.test.ts:49,57` (flag dispatch).

## Scope decision (P7) — three candidate scopes

- **Scope B (the request's literal "remove `manifest.ts` + `install-modules.ts` entirely") is REJECTED as infeasible in one increment**: it requires ripping legacy-config back-compat out of `add`/`update`/`list`/`status`/`remove`/`diff` and relocating `safeJoin`, breaking the documented "old pinned SHAs must keep working" guarantee. That is a separate multi-increment epic, not this PR. (See Open questions Q1.)
- **Scope A-clean (this plan's recommendation)**: rewire init default → archetype; delete the init-level legacy symbols **and** the 9 now-orphaned step files + their tests. Faithful to "remove the legacy flow entirely." Does not touch `manifest.ts`/`install-modules.ts`/`installer.ts`.
- **Scope A-minimal (fallback)**: same rewire + delete only `runInitLegacy`/`runInitV2`/`loadManifest` in `init.ts`; leave the 9 orphaned step files as (dead) code for a follow-up sweep. Smaller diff.

## Files (Scope A-clean)

<!-- Files-format note: the writes-scope setter + check-build-complete.mjs scan the back-tick
     path-items under `## Files` until the first heading/exclusion-cue, and REQUIRE each concrete
     scanned path to EXIST after build. So the scanned list below holds ONLY the written/modified
     files; deletions live under the `### Deleted` heading (parser stops there) and are removed via
     `git rm` (Bash — ungated by the enforce hook), never written. Brace-globs are expanded to
     concrete paths. Same A-clean file SET as approved at GATE 1 — reformatted for the floor tools. -->

Written / modified (in writes-scope; every path below exists after build):

- `src/commands/init.ts` — `runInit()` calls `runInitArchetype()` unconditionally (drop the `opts.archetype` branch + the manifest branch); delete `runInitV2`, `runInitLegacy`, `loadManifest`; strip now-dead imports (`manifest.js`: `categorizeModules`/`fetchRemoteManifest`/`resolveModules`; `wizard.js`: `applyDefaults`/`collectInstalls`; the 9 step imports; `prereqs`: `assertPrerequisites`; types `Manifest`/`WizardConfig`/`WizardSpec`). Keep `runInitArchetype` + `confirmOverwriteIfExists` verbatim.
- `src/index.ts` — `--archetype` kept as a **documented no-op alias** for one release: keep it in the boolean list so `pharn init --archetype` still parses; drop "experimental" from the help line and mark archetype the default; change `runInit({ archetype: … })` → `runInit()`.
- `tests/init.test.ts` — `runInit()` (no opts) now drives the archetype flow (mirror `tests/init-archetype.test.ts` fixture setup); assert the archetype path IS taken and that `src/commands/init.ts` no longer imports `../lib/manifest.js` (the sharpened no-404 guard, grill #2).
- `tests/init-archetype.test.ts` — archetype is now the default; exercise via `runInit()` with no opts; keep coverage.
- `tests/index.test.ts` — update the two dispatch assertions (`:49`, `:57`) for the no-op-alias flag handling.
- `CLAUDE.md` — doc-sync (added at GATE 2 per the human's "doc-sync then merge" decision): reframe the init description + the "commands/init.ts is a step pipeline" section to the archetype/capability flow; note the module/manifest/wizard machinery now serves ONLY as legacy-config back-compat for `add`/`update`/`list`/`status`/`remove`.
- `docs/commands/init.md` — doc-sync (GATE 2): rewrite the user-facing init page for the archetype-default flow (detect archetypes → resolve capabilities → summary → install), replacing the legacy module/wizard/schemaVersion content.

### Deleted (verified orphans — `init.ts`-only importers; removed via `git rm`, never written — deliberately OUTSIDE the writes-scope and the build-completeness set)

- `src/steps/module-select.ts`
- `src/steps/stackpack-select.ts`
- `src/steps/constitution-select.ts`
- `src/steps/multitenant-select.ts`
- `src/steps/mode-select.ts`
- `src/steps/detect.ts`
- `src/steps/wizard-questions.ts`
- `src/steps/summary.ts`
- `src/steps/install.ts`
- `tests/module-select.test.ts`
- `tests/stackpack-select.test.ts`
- `tests/constitution-select.test.ts`
- `tests/multitenant-select.test.ts`
- `tests/mode-select.test.ts`
- `tests/detect.test.ts`
- `tests/wizard-questions.test.ts`
- `tests/summary.test.ts`
- `tests/install.test.ts`
- `tests/init-v2.test.ts`

### Explicitly NOT touched (live back-compat — must stay)

- `src/lib/manifest.ts` — legacy-config fallback for `add`/`update`/`list`/`status`/`remove`/`diff`.
- `src/lib/install-modules.ts` — `safeJoin` source (consumed by the archetype path) + `installModule`/`installSkills` for the legacy fallback.
- `src/lib/installer.ts` — `fetchAndInstall`, still called by `add`/`update` for legacy configs.
- `src/lib/wizard.ts` — `add`'s `findSkillOption`/`listSkillAddresses`.

## Contracts satisfied

- No `pharn-contracts` methodology contract is added or changed — this is a product-CLI refactor. (P4: nothing to restate.)

## Evals to write (P1)

- init default → archetype: `runInit()` (no opts) invokes `detectArchetypesFromProject` + `parseCapabilityIndex` + `resolveCapabilities` + `installCapabilities`, and installs under the mirrored layout (flat / `pharn/` + `.claude/`). — `tests/init.test.ts` / `tests/init-archetype.test.ts`
- no-404 regression guard (grill #2, sharpened): assert the archetype path IS taken (`detectArchetypesFromProject` + `resolveCapabilities` + `installCapabilities` invoked) and that `src/commands/init.ts` no longer imports `../lib/manifest.js` — a positive assertion + static import check, not a fragile mock-not-called. — `tests/init.test.ts`
- flag alias: `npx pharn init --archetype` still runs without error and behaves identically to no-flag (no-op alias). — `tests/index.test.ts`
- legacy-init symbols gone: `typecheck` + `lint` pass with no dangling refs after deletion (the compiler is the enforcement). — CI

## Guarantee audit (P0)

- "`npx pharn init` (no flag) runs archetype detection, no manifest fetch, no 404" → **floor-adjacent**: enforced by the rewritten `tests/init.test.ts` mock-not-called assertion + `typecheck` (dangling import = compile error). Behavioral, deterministic, CI-gated. Not a new hook/content-hash primitive.
- "Legacy init symbols removed" → **mechanical**: `tsc --noEmit` fails on any surviving reference; `lint` flags unused. Deterministic.
- **Security (HONEST, narrowed):** removing the init legacy path does **NOT** close the Fable symlink-write finding in `install-modules.ts` — `installModule` remains reachable via the `add`/`update` legacy-config fallback (Scope B territory). The only true security delta here: the **default** `init` install path no longer routes through `installModule` at all (it uses `install-capabilities.ts`, which already rejects symlinks — `isSymlink`/`noSymlinks`). Claiming this PR "closes the symlink finding" would be false (P0) — it narrows exposure, it does not eliminate it.

## Trust audit (P2)

- No new untrusted-input ingestion. The archetype path (now default) already validates the fetched pharn-oss clone: names against `validate.ts` allowlists before any path-join, `safeJoin` on every read/write, explicit symlink rejection. This increment removes a code path; it adds no new taint source. Unchanged.

## Determinism audit (P5)

- `runInit` goes from a 3-way branch (`opts.archetype` / `schemaVersion===2` / else) to an **unconditional** call — strictly more deterministic, no new branches. The `--archetype` flag becomes a no-op (its value is never branched on). ✓

## Open questions — RESOLVED at GATE 1 (no HALT outstanding)

- **Q1 — Scope.** RESOLVED → **A-clean**: rewire init default + delete the init-level legacy symbols **and** the 9 orphaned step files + their tests + `init-v2.test.ts`. (Scope B — delete `manifest.ts`/`install-modules.ts` outright — stays out: it breaks the documented `pharn update` back-compat guarantee and is multi-increment.)
- **Q2 — `--archetype` flag.** RESOLVED → **no-op alias for one release**: keep the flag parsing so `pharn init --archetype` still runs; `runInit()` ignores it; help text updated.

No open questions remain; the plan was approved at GATE 1 (see the advisory `GRILL.md` for the interrogation).
