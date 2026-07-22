# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`pharn-cli` is an interactive CLI that installs [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code — into an existing project (framework-agnostic). `pharn init` detects the project's **archetype(s)** (`ssr`/`backend`/`spa`/`lib`) and installs the applicable PHARN **capabilities** (grillers/lenses) from `pharn-dev/pharn-oss` via degit, copying them plus the fixed product surfaces into the mirrored layout (`.claude/` + `pharn/`) and writing `pharn.config.json`. No module catalog / `manifest.json` fetch. Published on npm as `pharn`, exposing a single `pharn` bin. Targets Claude Code today; Codex and Cursor are planned.

**Module model (removed).** Earlier releases installed by *modules* driven by a repo-root `manifest.json` (schemaVersion 1/2 + a `wizard` block + per-module `module.json` `installs` maps), and kept a module/manifest fallback in `add`/`update`/`list`/`status`/`remove` for a pre-archetype config. **That subsystem is gone** (`lib/manifest.ts`, `install-modules.ts`, `installer.ts`, `wizard.ts` deleted) — live pharn-oss ships no `manifest.json`, so the fallback 404'd. **All commands are archetype-only.** A pre-archetype (module) `pharn.config.json` (one with `modules[]` but no `capabilities[]`) is detected by `isArchetypeConfig` and rejected up front by `loadArchetypeConfigOrExit` with a clear "re-run `pharn init`" message (`LEGACY_CONFIG_MESSAGE`) — never a fetch. **This CLI still owns the `pharn.config.json` schema**, which stays additive: a legacy config's now-unused fields (`modules`, `constitution`, `installedSkills`, `stackAnswers`) still LOAD (P7).

## Commands

```bash
npm run dev -- init          # run the CLI via tsx (pass args after --)
npm run build                # tsc → dist/
npm run build:install-local  # build + symlink pharn into local test-app/node_modules
npm run typecheck            # tsc --noEmit for src AND tests (two configs)
npm run lint                 # eslint src
npm run format:check         # prettier check (use `format` to write)
npm test                     # vitest run (single pass)
npm run test:watch
npx vitest run tests/install-capabilities.test.ts   # single test file
```

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, and test — all four must pass. `PHARN_DEBUG=1` enables full error output for fetch/install failures.

## ESM / module conventions

ESM-only (`"type": "module"`, NodeNext). **Relative imports must use `.js` extensions** even though the source is `.ts` (e.g. `import { runInit } from './commands/init.js'`). `tsconfig.json` sets `strict` and `noUncheckedIndexedAccess` — index access is `T | undefined`, hence the `!` assertions on validated array indices.

## Architecture

`src/index.ts` parses argv with minimist and dispatches to `commands/{init,add,remove,update,list,status}.ts`. `init` is the default command. Every non-init command loads the config via `loadArchetypeConfigOrExit` (which rejects a pre-archetype config, above) — except `list`, which does its own json-aware check so its error stays on stderr under `--json`. `list` is read-only (reads `pharn.config.json` only — no clone, no fetch, no writes); `--json` emits a single inventory object on stdout (diagnostics to stderr). `status` is also read-only (the read side of `update`) — see its addressing note below. `remove` (alias `rm`) is the inverse of `add` — see its addressing note below (`--yes`/`-y` is now a no-op: capability removal has no confirm prompt).

**`commands/init.ts` is the archetype install flow** — the only init flow (the legacy module/wizard step pipeline `runInitLegacy`/`runInitV2` and its `steps/*` were removed). `runInit` calls `runInitArchetype` unconditionally:

1. `prereqs` (`runGitPrereq`) — hard-fails if `.git` is absent. `fresh-check` — warns (commit count + tracked-file heuristic) on a non-fresh repo.
2. `detectArchetypesFromProject` (`lib/detect-archetype.ts`) — merges `package.json` dependency names + a bounded, symlink-safe file-tree walk into an `Archetype[]` (`ssr`/`backend`/`spa`/`lib`).
3. `fetchRepo` (`lib/repo.ts`) — degit-clone pharn-oss to a temp dir (cleaned up in a `finally`; every `process.exit`/`cancelAndExit` happens AFTER it).
4. `parseCapabilityIndex` (`lib/capability-index.ts`) + `resolveCapabilities` (`lib/resolve-capabilities.ts`) — select capabilities whose `applies` is `universal` or intersects the detected archetypes; skip the rest with a reason.
5. `runArchetypeSummary` (selected + skipped) → `install` / `cancel`; on `install`, `confirmOverwriteIfExists` guards an existing config, then `runInstallArchetype` (`steps/install-archetype.ts` → `lib/install-capabilities.ts`) copies the capabilities + fixed product surfaces into the mirrored layout (flat OR `pharn/`) and writes the archetype `pharn.config.json` (`archetypes`, `capabilities`, `layout`, `skillsVersion` from `SKILLS_VERSION`, `modules: []`; canonical `CONSTITUTION.md` copied verbatim). The `--archetype` CLI flag is a retained no-op alias for one release.

**`lib/install-capabilities.ts`** is the shared capability copy core used by init/add/update. `installCapabilityDirs(repoDir, projectRoot, capabilities, paths?)` pre-flights **every** selected capability source (validated name via `CAPABILITY_NAME_RE` + `safeJoin` + existence + symlink rejection) before any write — no partial installs — then copies each griller/lens dir into the mirrored layout (`add` uses this alone). `installCapabilities` additionally copies the fixed product surfaces: product `pharn-*` commands (excluding `pharn-dev-*`), `.cjs` hooks (excluding `*.test.cjs`), `settings.json` (**never** overwritten), the trusted docs, `pharn-contracts/`, and `.dev/floor/` minus test files. Copying from the untrusted clone is symlink-guarded (`isSymlink` reject / `noSymlinks` filter) and `safeJoin`-contained; file contents are copied verbatim, never executed. The install set is resolved by `lib/capability-index.ts` (`parseCapabilityIndex` — the untrusted-frontmatter → typed `CapabilityIndex` fetch boundary, reading only `name`/`role`/`applies` via a strict field reader) + `lib/resolve-capabilities.ts` (select where `applies` is `universal` or intersects the detected archetypes). The commit SHA is threaded from `fetchRepo` (`repo.sha`) — no separate GitHub fetch (closes the resolve/fetch TOCTOU).

**`lib/validate.ts` is security-sensitive.** Untrusted names, versions, paths, and capability frontmatter are validated against strict regex/enum allowlists (`CAPABILITY_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`, `COPY_FILENAME_RE`, the `role`/`applies` enums), checked for `..`, and rejected on control chars. **`safeJoin` lives here** (relocated from the deleted `install-modules.ts`) — the lexical path-containment gate that `install-capabilities.ts`, `diff.ts`, `capability-index.ts`, `layout.ts`, `skills-version.ts`, and `remove.ts` all guard their fs access with, so nothing escapes its base dir (`install-capabilities.ts` adds a symlink-aware backstop at the write sites). Remote fetches (`skills-version.ts`) use `redirect: 'error'`, an 8s timeout, and a 256KB body cap. Preserve these invariants.

**`lib/pharn-config.ts`** reads/writes `pharn.config.json` (`pharnVersion`, `skillsVersion`, `repo`, `commit`, `installedAt`, and — for an archetype install — `archetypes[]`, `capabilities[]` (`{name, role}`), `layout`, plus the `models`/`seam` blocks). Schema is additive — a legacy config's now-unused `modules[]`/`constitution`/`stackAnswers`/`installedSkills[]` still load (P7). `isArchetypeConfig` (= `Array.isArray(config.capabilities)`) is the deterministic discriminator; **`loadArchetypeConfigOrExit`** is the shared load-or-reject surface for `add`/`update`/`status`/`remove` (a pre-archetype config → `LEGACY_CONFIG_MESSAGE` + exit(1), never a fetch; `list` keeps its own json-aware check so `--json` stderr stays clean). `add`/`update`/`remove` update the config in place; none touches `CONSTITUTION.md`.

**`pharn add` addressing** (`commands/add.ts` + `lib/capability-address.ts`). `add <name>` or `add <role>:<name>` (e.g. `add a11y`, `add lens:n-plus-one`) installs one capability into an archetype project — a manual override of archetype auto-selection. It clones pharn-oss (SHA-pinned), resolves the arg against `parseCapabilityIndex`, and if it uniquely names a not-yet-installed capability, copies it via `installCapabilityDirs` and **appends** to `capabilities` (never touches `archetypes`). Already-installed → no-op; unknown/ambiguous → lists the valid `role:name` addresses. `pharn update` re-resolves the **recorded archetypes** against the latest index and re-copies (mirrors the legacy update's re-resolve-recorded step).

**`pharn remove` addressing** (`commands/remove.ts`) is the inverse of `add`. `remove <name>` / `remove <role>:<name>` (no arg → an interactive picker over the installed capabilities) deletes that one isolated capability dir — addressed at the project's recorded `layout` (flat `pharn-review` / `pharn-pipeline/grillers/<name>`, OR the same under `pharn/`, via `configLayout` + `layoutPaths`) — and drops its `capabilities` entry. **No clone, no network** — everything is derivable from `config.capabilities` + the filesystem, so `remove.ts` imports no repo module at all; `archetypes` is never touched, and `CONSTITUTION.md`/`memory-bank/` are never in a capability dir. Not-installed → benign no-op listing the removable capabilities; a name installed in both roles → hard-fail (ambiguous). `--yes`/`-y` is a no-op (there is no confirm prompt to skip). Every delete path is `safeJoin`-contained.

**`pharn status` (`commands/status.ts`) is strictly read-only** — it never writes, deletes, or overwrites (fixing is `update`/`add`). Two sections: a **version** check (installed `skillsVersion` vs upstream `SKILLS_VERSION`, plus an archetype + capability-count summary) and a **drift** check. Default clones `@main` once and reuses it for both; `--no-drift` skips the clone and uses `fetchRemoteSkillsVersion` for the version section only; `--strict` exits 1 on any outdated/modified/missing (CI gate, default exit 0). Cleanup runs in a `finally`, and every `process.exit` happens *after* it. The pure (no I/O) engine is **`lib/diff.ts` → `diffInstalledCapabilities`**: it mirrors `installCapabilities` to derive the **expected** file set — the selected capability dirs + the fixed product surfaces, at the recorded `layout` — then `sha256`-compares each against the project root, returning `{modified, missing, okCount}`. Every read is `safeJoin`-guarded (from `lib/validate.ts`). `.claude/settings.json` is user-owned (preserved at install) and excluded; the copied-verbatim trusted docs, hooks, contracts, and floor checkers ARE compared. Drift is derived live from the clone (no stored hashes), always against `@main`, never the pinned `commit`.

## Testing

Tests live in `tests/*.test.ts` (vitest, node env). `tests/helpers.ts` provides `stubProcessExit` (turns `process.exit` into a throwable `ProcessExit`), `useTmpDir`, and `CANCEL`. The lib tests build fake fetched-repos on disk to exercise copy/materialize without network. When changing behavior, update the matching test before touching code.

## Documentation discipline

`docs/` is user-facing and kept in sync with code. Do not document unimplemented behavior without marking it **Coming soon** or linking `docs/roadmap.md`.
