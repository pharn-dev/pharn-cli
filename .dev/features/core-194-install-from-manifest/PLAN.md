# PLAN — core-194-install-from-manifest (Linear CORE-194, C8.2, epic CORE-157)

- spec_content_hash: bca940a5ad247c120e6d8a3acba119d0d8df51dca275964d0e54c48d729d3c4e # fix #4
- increment: when the fetched pharn-oss tree carries `pharn-install.json` (C8.1), `pharn` validates it strictly, verifies every declared file's raw-byte sha256 right after extraction (inside `fetchRepo`, before any command can write), and then takes the install manifest, the capability index, the settings copy and the `models` defaults from it; a tree without it (every release up to now, any flat ref) keeps today's derivation byte for byte, as a fallback removed in v0.22.0.
- base: origin/main @ b66d1aa2. Branch `przemek/core-194-c82-the-cli-installs-from-the-manifest-and`.
- layer(s): CLI fetch boundary + selection/install libs (`src/lib`), one command message (`src/commands/init.ts`), eslint message text, tests, docs, CHANGELOG, `CLAUDE.md` module map; `THREAT-MODEL.md` by a patch script the user runs.
- constitution_refs: [P0, P1, P2, P3, P4, P5, P7]

## Why (discovery, live state this run)

- The CLI derives the install from pharn-oss internals in four places, each taking only `repoDir`: `parseCapabilityIndex` (capability-index.ts, frontmatter port), `collectInstallManifest` → `collectExpectedInstallPaths` / `absentInstallSurfaces` / `capabilityCloneFiles` (install-manifest.ts, surface rules + `FLOOR_TEST_FIXTURES_DIRS` + `PHARN_ROOT_FALLBACK_DOCS` via layout.ts), `upstreamSettingsCopyable` (install-capabilities.ts), and `readUpstreamModels` (upstream-models.ts, root `pharn.config.json`). Consumers (grep this run): init, init-plan, overwrite-check, write-targets, install-capabilities, add, add-picker, update-plan, status, diff. None needs a signature change if the branch sits inside those four functions.
- `fetchRepo` (repo.ts) is the only producer of a clone; every command fetches through it before any read or write, and a throw inside its `try` removes the tree. The release-tag `SKILLS_VERSION` check already refuses there. That is where the sha256 verification belongs: a mismatch throws before any caller sees the tree, so nothing is written.
- `sha256File` (raw bytes) exists in hash.ts, but an eslint `no-restricted-imports` entry bans importing it from any other `src/` file (MSG: "byte pins in tests only"); `tests/lint-rules.test.ts` proves it fires.
- Only `init` prefixes a fetch failure with "Could not reach <repo>:" (`ReleaseResolveError` is shown bare); update/status/add show the error message as is.
- `isInstallRootPath` (install-surfaces.ts) bounds record keys for BOTH layouts, with the install's own name filters for commands/agents/hooks; `.claude/settings.json` is outside it (user-owned).
- Upstream (pharn-oss worktree core-193, NOT merged): the approved PLAN is the contract; `pharn-install.json`, `docs/install-manifest.md` and the generator are not written yet. Every upstream file name under `.claude/` and `pharn/` matches `[A-Za-z0-9._/-]`; product command/agent/hook basenames pass `COPY_FILENAME_RE`; no nested hook dirs. Package version is 0.19.0 (this lands for v0.21.0).

## Design

1. **NEW `src/lib/upstream-manifest.ts`** (fetch boundary, data only, never executed):
   - `MANIFEST_FILE = 'pharn-install.json'`, `MANIFEST_SCHEMA_VERSION = 1`, `MAX_MANIFEST_BYTES = 4 MiB`, `MAX_MANIFEST_FILES = 20_000` (the extractor's entry cap).
   - `readUpstreamManifest(repoDir): UpstreamManifest | null` — `readJsonBounded` (regular file, cap, `O_NONBLOCK`); absent → `null` (the fallback). Present but unusable/invalid JSON/invalid → throws `UpstreamManifestError` (extends `ManifestValidationError`; fixed messages, untrusted values through `escapeUnsafe`/`JSON.stringify`, never V8's parse message).
   - Strict validation, in order: top level is an object; `schemaVersion === 1` exactly (else: "declares schemaVersion N; this pharn reads 1 — upgrade pharn (`npm install -g @pharn-dev/pharn@latest`); with `--ref main` the tip may be ahead of the latest release. Nothing was written."); `skillsVersion` passes `VERSION_RE` and equals the tree's `SKILLS_VERSION` (`readSkillsVersion`); `layout.name === 'pharn'`, its marker and griller/lens subtrees equal `layoutPaths('pharn')` and the marker exists in the tree (`detectLayout(repoDir) === 'pharn'`) — anything else: "a layout this pharn does not know; upgrade pharn"; `capabilities[]`: `name` `CAPABILITY_NAME_RE`, `role` `assertRole`, `dir === <subtree(role)>/<name>`, unique `role:name`, `applies` = `'universal'` or a non-empty string array (tokens judged later, decision 1); `files[]` (≤ cap): `path`/`dest` pass `MANIFEST_PATH_RE` (posix segments of `[A-Za-z0-9._-]`, no `.`/`..`/empty segment, no leading `/`) and `safeJoin`; `dest` unique; `sha256` `/^[0-9a-f]{64}$/`; `policy ∈ {managed, if-absent}`; `surface` matches the token regex `/^[a-z][a-z0-9-]*$/` (never a closed enum); `capability` present iff `surface === 'capability'`, naming a declared capability, with `path === dest` under its `dir`; every capability owns ≥ 1 file; **the outer bound** (decision 2): `if-absent` only for `path === dest === .claude/settings.json`, that dest only as `if-absent`, and every other `dest` must pass `isPharnOwnedPath(dest)`; `models` is an object whose `defaults` is anything (checked later by `checkModelsBlock`) and `rules` an object (type-checked only, decision 3); `installRoots` has `include`/`exclude`/`legacy` string arrays (type-checked only; the CLI's bound is the bound).
   - `verifyUpstreamManifest(repoDir, manifest)`: every file `path` is a regular file in the tree (`lstat`) and `matchesRawSha256(path, sha256)` (hash.ts); any mismatch or missing file → `UpstreamManifestError` naming the path (escaped), "refusing to install; nothing was written".
   - Pure projections used by the four branch points: `manifestCapabilityIndex(m)`, `manifestInstallFiles(repoDir, m, capabilities)` (dest → source map + per-surface counts), `manifestCapabilityFiles(m, cap)`, `manifestSettingsDeclared(m)`, `manifestModelsDefaults(m)`.
2. **`fetchRepo` (repo.ts)**: inside the existing `try`, after the release `SKILLS_VERSION` check: `const manifest = readUpstreamManifest(dir); if (manifest) verifyUpstreamManifest(dir, manifest);` — a throw removes the tree. No signature change.
3. **The four branch points** (each: `const m = readUpstreamManifest(repoDir); if (m) return …fromManifest…;` with the comment `// Derivation fallback for trees without pharn-install.json: removed in v0.22.0 (CORE-186).`):
   - `parseCapabilityIndex` → capabilities from the manifest, grillers then lenses, name-sorted (the fallback's order). An `applies` token outside the CLI's enum makes THAT capability `unknown` (reason via `assertAppliesToken`'s message), exactly the fallback's "fail closed on installing, never on seeing"; `[..., 'universal', ...]` → `'universal'`.
   - `collectInstallManifest` → managed non-capability files + the selected capabilities' files, dest → `safeJoin(repoDir, path)` (LICENSE lands at its declared dest); surface accounting for `absentInstallSurfaces` counts manifest files per CLI-declared surface (commands, hooks, trusted-doc, license, features-readme, contracts, core, floor), absent named at `layoutPaths('pharn')`'s path, as today. A surface name the CLI does not know is installed (dest already bounded), not accounted.
   - `capabilityCloneFiles` → that capability's dests, sorted.
   - `upstreamSettingsCopyable` → the manifest declares the `if-absent` settings entry (sha-verified ⇒ present).
   - `readUpstreamModels` → the block is `models.defaults` (absent/null → `absent`), then the SAME `checkModelsBlock` + serializability check, factored into one local `checkUpstreamBlock`.
4. **hash.ts** gains `matchesRawSha256(path, expected): boolean` (raw bytes; `contentHash` stays the CRLF-folded comparison hash for records/drift). The `sha256File` import ban and its lint-rules case stay; the MSG names `matchesRawSha256` as the one raw-byte check `src/` may use.
5. **install-surfaces.ts — ONE CLI-owned outer bound, `isPharnOwnedPath(rel)`** (decision 2), the predicate both the manifest's `dest` check and the record-key bound use. True iff `rel` is a posix path of safe segments (`[A-Za-z0-9._-]`, none starting with `.`, no `.git` segment by construction) and either:
   - (a) **under `pharn/`, inside a pharn-owned entry**: the first segment below `pharn/` is `pharn-*` (not `pharn-dev-*`; any depth below it — a NEW surface such as `pharn/pharn-new/x.md`), or one of today's fixed pharn-layout roots (`floor/**`, the four trusted docs, `LICENSE`, `features/README.md`); a path under a capability subtree must lie inside a capability dir (`capabilityOf`). Never user data: `memory-bank/`, `features/<x>/`, `spec-template.md`, `.backup/`, `.lock` all fail (not `pharn-*`, not a fixed root, or dot-led);
   - (b) **under `.claude/<dir>/`** (`<dir>` a lowercase token): the entry directly under `<dir>` is pharn-owned — a file `pharn-*.(md|cjs|mjs|json)` passing `COPY_FILENAME_RE` and not `pharn-dev-*`, or a directory `pharn-*` (not `pharn-dev-*`) with any safe depth below it (a NEW surface such as `.claude/skills/pharn-x/SKILL.md`); plus today's hook rule for `.claude/hooks/` (top-level `.cjs`/`.mjs`, not `*.test.*`, `COPY_FILENAME_RE`), since upstream hook names are not `pharn-` prefixed.
   - (c) `.claude/settings.json` is NOT in it: it is accepted only by the manifest check above as `if-absent`, and stays outside the record-key bound (never recorded; uninstall-plan's own special case is unchanged).
   Never anything outside `.claude/` + `pharn/`, never `.claude/settings.local.json` (directly under `.claude/`, no `<dir>`), never the project root. Why one predicate: a dest the install may write must be a key orphans/uninstall/prettierignore may later handle, or a file installed into a new surface could never be updated, orphaned or uninstalled; and the bound is CLI-owned, never the manifest's `installRoots`, because the manifest is untrusted (an `include: ["**"]` would otherwise reach `.git/hooks/`). `isInstallRootPath(rel)` becomes `rel !== MODELS_RECORD_KEY && (legacy rule over both layouts, unchanged || isPharnOwnedPath(rel))`, so every existing positive and negative row in `tests/orphans.test.ts` keeps its answer (checked row by row: `pharn/floorx/y.mjs`, `pharn/pharn-pipeline/grillers/notes.md`, `.claude/commands/sub/pharn-x.md`, `pharn/.claude/agents/…`, `pharn/features/my-feature/PLAN.md` stay false). Deletion stays gated by the records hash rule.
6. **init.ts**: an `UpstreamManifestError` from `fetchRepo` is shown bare (like `ReleaseResolveError`), not as "Could not reach …". update/status/add already show the message as is.
7. Not deleted (owner decision 2): the derivation, vendored pharn-oss fixtures, differential/parity tests, `FLOOR_TEST_FIXTURES_DIRS`, `PHARN_ROOT_FALLBACK_DOCS`, `model-config.ts`.

## Files

- `src/lib/upstream-manifest.ts` — NEW: read/validate/verify + projections (≈ 330 lines) — layer lib (fetch boundary)
- `src/lib/repo.ts` — read + verify inside `fetchAt`'s try — layer lib
- `src/lib/hash.ts` — `matchesRawSha256` — layer lib
- `src/lib/install-surfaces.ts` — `isPharnOwnedPath` (the outer bound) + `isInstallRootPath` defined through it — layer lib
- `src/lib/capability-index.ts` — branch point — layer lib
- `src/lib/install-manifest.ts` — branch points (collect + capabilityCloneFiles) — layer lib
- `src/lib/install-capabilities.ts` — branch point (`upstreamSettingsCopyable`) — layer lib
- `src/lib/upstream-models.ts` — branch point + `checkUpstreamBlock` — layer lib
- `src/commands/init.ts` — bare message for `UpstreamManifestError` — layer command
- `eslint.config.mjs` — `sha256File` MSG text names `matchesRawSha256` — dev tooling
- `tests/support/harness.ts` — `withManifest(tree, edit?)`: builds `pharn-install.json` FROM the fixture tree (test-side classifier, real sha256 of the served bytes; never a vendored upstream file) — test support
- `tests/upstream-manifest.test.ts` — NEW lib table: happy path; absent → null; each refusal (schemaVersion 2 names upgrade + `--ref`; not JSON; not an object; oversize; skillsVersion mismatch/format; layout name/marker/subtree; capability name/role/dir/duplicate/zero files; path `..`/absolute/backslash/control char/empty segment; duplicate dest; dest outside the outer bound (`.git/hooks/x`, `.claude/settings.local.json`, `README.md`, `package.json`, `pharn/memory-bank/x`, flat-root `CONSTITUTION.md`, `../x`); dev command dest; bad command basename; `if-absent` on another file; settings as managed; bad sha format; bad policy/surface; capability field on a non-capability surface; capability path ≠ dest); verify: mismatch, missing file, directory where a file is declared, CRLF file verified on RAW bytes — layer test
- `tests/hash.test.ts` — `matchesRawSha256`: raw vs folded (a CRLF file's raw digest matches, its `contentHash` does not), uppercase/garbage expected → false, unreadable → throws — layer test
- `tests/lint-rules.test.ts` — the `sha256File` case stays; NEW case: importing `matchesRawSha256` from hash.js is NOT flagged — layer test
- `tests/repo.test.ts` — fetchRepo with a manifest: verified → returns; mismatch → throws `UpstreamManifestError`, temp tree removed — layer test
- `tests/orphans.test.ts` — existing rows unchanged; NEW rows: new-surface keys (`.claude/skills/pharn-x/SKILL.md`, `pharn/pharn-new/x.md`) ARE install paths; `pharn/memory-bank/x.md`, `pharn/spec-template.md`, `pharn/.backup/x`, `pharn/.lock`, `.claude/skills/my-skill/SKILL.md`, `.claude/pharn-x.md`, `.git/hooks/pre-commit`, `.claude/skills/pharn-x/.hidden` are not; NEW `describe('isPharnOwnedPath')` table — layer test
- `tests/install-manifest.test.ts` — NEW: manifest-driven `collectExpectedInstallPaths` / `absentInstallSurfaces` / `capabilityCloneFiles` (incl. a file the derivation would never pick, `pharn/floor/fixtures/x.mjs`, installed because declared; a derivation-picked file left out of the manifest is not installed) — layer test
- `tests/capability-index.test.ts` — NEW: manifest index (order, `universal` fold, unknown token → `unknown`, frontmatter ignored when a manifest exists) — layer test
- `tests/upstream-models.test.ts` — NEW: defaults from the manifest win over the root config; null defaults → absent; invalid defaults → invalid with the checker's reasons — layer test
- `tests/commands/init.test.ts` — NEW `describe('with pharn-install.json')`: installed set == manifest fixed files + selected capabilities (records keys equal it), a new surface `.claude/skills/pharn-x/SKILL.md` installed and recorded, `pharn/LICENSE` from `LICENSE`, settings copied only when absent and never recorded, `models` from `models.defaults`; sha mismatch → exit 1, message names the file, project tree byte-identical (snapshotTree), no config/records; malformed manifest (schemaVersion 2; dest `.git/hooks/pre-commit`) → exit 1, nothing written; no manifest → the existing suite (unchanged) — layer test
- `tests/commands/update.test.ts` — NEW: v1 (no manifest) → v2 with a manifest: files from the manifest written, an undeclared old file is an orphan handled as today; a new-surface file is installed by v2 and updated by v3 (record moves), and reported ORPHANED when v4 drops it; sha mismatch on update → exit 1, nothing written — layer test
- `tests/commands/uninstall.test.ts` — NEW: a new-surface file (`.claude/skills/pharn-x/SKILL.md`) installed from a manifest is deleted by `uninstall` (records hash matches) and kept when edited — layer test
- `tests/commands/add.test.ts` — NEW: `add` with a manifest writes exactly the capability's declared files and records them — layer test
- `tests/commands/status.test.ts` — NEW (one case): status with a manifest reports no drift after a manifest init — layer test
- `docs/architecture.md` — fetch boundary + "how the install set is chosen" (manifest first, derivation fallback until v0.22.0) — docs
- `docs/commands/init.md` — what gets installed: the manifest when pharn-oss ships one — docs
- `CLAUDE.md` — module map: `upstream-manifest` in the fetch boundary line; one Invariants clause ("a declared file's raw sha256 is verified in `fetchRepo`") — docs
- `CHANGELOG.md` — `## [Unreleased]` → **Added** line, naming the v0.22.0 removal of the fallback — docs
- `THREAT-MODEL.md` — via `patch-CORE-194.py` (scratchpad), the user runs it: §2 surface + §3 table row + §3.1 (`models` from the manifest) — human-owned

No test file, `describe` or `it` is deleted or renamed.

## Contracts satisfied

- CLAUDE.md invariants: Containment (`safeJoin` on every path/dest), Allowlists (name/role/applies/version/sha/path regexes), The clone is data (manifest parsed as JSON data, nothing executed; `repo.ts` stays the only producer), Bounded local reads (`readJsonBounded` with a cap), Records are the proof (records still from dest `contentHash`), `--json` reports unchanged (no new key), Fail closed (unknown schemaVersion refuses), Network bounds unchanged (no new fetch path: the manifest rides the same tarball).
- `docs/install-manifest.md` (pharn-oss, C8.1) — the schema this reader validates; cited, not restated.

## Evals to write (P1)

- Each refusal above → `UpstreamManifestError`, one `it` per class (table-driven).
- sha mismatch → command exit 1, nothing written (init, update); verified → install proceeds.
- manifest present → install set, capability index, settings decision and `models` all come from it (each proved by a fixture where manifest ≠ derivation).
- manifest absent → every existing suite unchanged (no existing test edited).

## Guarantee audit (P0)

- "a file whose bytes differ from the manifest's sha256 is never installed; nothing is written" → floor: raw sha256 equality in `fetchRepo` before the tree is returned (content-hash) + control flow (a throw removes the tree; every write follows `fetchRepo`). Residual (named): the clone is re-read at copy time — same private `mkdtemp` premise as the clone invariant.
- "a manifest dest cannot land outside `.claude/` + `pharn/` pharn-owned entries, user data included" → floor: `safeJoin` + `MANIFEST_PATH_RE` + `isPharnOwnedPath` (regex/prefix membership over CLI constants, never the manifest's own `installRoots`). Advisory residual: a `pharn-*` entry under an arbitrary `.claude/<dir>/` is taken on its name alone — a user file named `pharn-*` there is overwritten only after the existing backup-before-overwrite rules (unrecorded → backed up first).
- "an unknown schemaVersion refuses" → floor: exact-match (P0's schema-version primitive).
- "names/roles/versions are allowlisted" → floor: existing regexes/enums.
- "the manifest is authentic" → **advisory**: provenance only — it arrives in the same tarball, at the same tag-resolved commit (C3.1 `release.ts`), as the files it describes; the sha256 binds files to the manifest, not the manifest to pharn-oss (LIMITS §1b unchanged).
- "the manifest is correct/complete" → **advisory** (upstream's generator + drift check own it).

## Trust audit (P2)

- `pharn-install.json` is untrusted network-derived data. Every field that drives a path, a selection or a config write is allowlisted before use; `models.defaults` passes the same `checkModelsBlock` gate as today before reaching `pharn.config.json`; `rules`/`installRoots` are type-checked and drive nothing. Values quoted in refusals go through `escapeUnsafe`/`JSON.stringify`.

## Determinism audit (P5)

- Every branch is a membership/equality test: file presence, `=== 1`, regex, enum, `Set.has`, digest `===`. No fallback guess: present-but-bad refuses; absent derives.

## Resolved at GATE 1 (orchestrator, 2026-11-16)

1. An `applies` token outside the CLI enum → that capability is `unknown` (seen, reported, never installed). Same forward-compat rule for `surface`: a safe token regex, never a closed enum.
2. ONE CLI-owned outer bound, `isPharnOwnedPath` (Design 5), replaces the per-surface filters for manifest dests and widens the record-key bound to match, so a new surface installs, records, updates, orphans and uninstalls with no CLI release. A dest outside it refuses the whole manifest (an anomaly, not a new surface). Deviation from the brief, recorded: "COPY_FILENAME_RE per segment as today" is not today's rule under `pharn/` (`SKILL.md`, `README.md`, `CONSTITUTION.md`, `LICENSE` fail it) — the per-segment rule is the safe-segment regex, and `COPY_FILENAME_RE` applies to a FILE directly under `.claude/<dir>/`, as today. And `pharn/` entries must be `pharn-*` or a fixed root, so user data under `pharn/` stays out and no existing test row changes.
3. Model rules are NOT consumed; `model-config.ts` stays the one validator; `rules`/`installRoots` type-checked only. **Residual for the removal ticket:** before `model-config.ts` can go, it must decide how the model rules reach `status` and `update`'s project-block checks, which run without a clone (or offline).
4. Re-read at each branch point, through the ONE validating parser `readUpstreamManifest` (verify takes its result; no second parse path), and `verifyUpstreamManifest` runs inside `fetchRepo` before the tree is returned, so no command reaches a branch point on an unverified tree.

## Open questions (HALT)

- None blocking. Field names follow upstream's PLAN; adapt to the final `docs/install-manifest.md` (C8.1) when it lands, before opening the PR.
