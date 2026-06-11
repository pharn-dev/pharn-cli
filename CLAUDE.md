# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`pharn-cli` is an interactive CLI that installs [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code — into an existing Next.js project. `pharn init` runs a wizard, fetches the chosen PHARN modules from `pharn-dev/pharn-oss` via degit, copies them into `.claude/`, materializes the constitution + memory bank, and writes `pharn.config.json`. Published as `pharn-cli`, exposing both `pharn` and `pharn-cli` bins. Targets Claude Code today; Codex and Cursor are planned.

**Module model (important):** PHARN ships as modules (subfolders of the pharn-oss repo: `pharn-core`, `pharn-pipeline`, `pharn-review`, `pharn-audits`, `pharn-stack-react`, `pharn-stack-nextjs`). `pharn-core` is always installed; everything else is optional and depends on it. Each module's `module.json` has an `installs` map (source dir → destination dir in `.claude/`). The repo-root `manifest.json` is the authoritative version + dependency graph. **This CLI owns the `pharn.config.json` schema; pharn-oss owns the module/manifest schemas** (`scripts/schemas/` in that repo).

**Manifest schemaVersion 1 vs 2.** The CLI understands two manifest schemas and routes on `schemaVersion` (anything else hard-fails). **v1** = the legacy flow: module multiselect → stack pack → privacy posture, whole-module installs. **v2** = the wizard flow: the manifest carries a `wizard` block (`sections[].questions[].options[]` + `rules[]` + `defaults`) that is the single source of truth for the init questionnaire, plus `kind: "skill-category"` modules (`pharn-skills-db`/`-orm`/`-auth`/`-payments`/`-email`) whose individual skill subfolders are installed **selectively** based on answers. Old pinned SHAs (v1) must keep working — never break `pharn update` against them.

## Commands

```bash
npm run dev -- init          # run the CLI via tsx (pass args after --)
npm run build                # tsc → dist/
npm run build:install-local  # build + symlink pharn into parent node_modules
npm run typecheck            # tsc --noEmit for src AND tests (two configs)
npm run lint                 # eslint src
npm run format:check         # prettier check (use `format` to write)
npm test                     # vitest run (single pass)
npm run test:watch
npx vitest run tests/manifest.test.ts   # single test file
```

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, and test — all four must pass. `PHARN_DEBUG=1` enables full error output for fetch/install failures.

## ESM / module conventions

ESM-only (`"type": "module"`, NodeNext). **Relative imports must use `.js` extensions** even though the source is `.ts` (e.g. `import { runInit } from './commands/init.js'`). `tsconfig.json` sets `strict` and `noUncheckedIndexedAccess` — index access is `T | undefined`, hence the `!` assertions on validated array indices.

## Architecture

`src/index.ts` parses argv with minimist and dispatches to `commands/{init,add,update}.ts`. `init` is the default command.

**`commands/init.ts` is a step pipeline.** Each `steps/*.ts` file is one stage and uses `@clack/prompts` for I/O:

1. `prereqs` — hard-fails if `next` isn't in package.json or `.git` is absent.
2. `fresh-check` — warns (commit count + custom-file heuristic) when the project isn't a fresh Next.js scaffold.
3. Fetch the module catalog (`lib/manifest.ts` → `fetchRemoteManifest`) and branch on `schemaVersion`.
4. **v1 (`runInitLegacy`):** a loop of `module-select` (multiselect optional) → `stackpack-select` (single, exclusive) → `constitution-select` (privacy posture → variant) → `summary`. **v2 (`runInitV2`):** `mode-select` (Default / Custom) → answers (Default = `wizard.defaults` verbatim, asks nothing per-tech; Custom = `wizard-questions` renders each section, applying `hide` / `hideQuestion` / `relabel` rules against prior answers, `comingSoon` options dimmed + unselectable, `warn` rules soft-confirmed after each answer) → methodology `module-select` (excludes `kind:"skill-category"`) → `stackpack-select` → `constitution-select` → `vendor-consent` (records consent for options carrying a `vendorSkill`; external fetch is **Coming soon**) → `summary` (now also lists the per-tech SKILLS + vendor block). Both flows: summary returns `install` / `cancel` / loop-again with previous answers preserved.
5. On install: `steps/install.ts` → `lib/installer.ts`.

**`lib/wizard.ts`** is the pure (no-I/O) rule engine + answer resolver: `matchCondition` (AND across keys; `string` = equality, `{not}` = negation; missing key fails equality / satisfies `not`), `applyRulesToQuestion`, `pendingWarnings`, `collectInstalls`/`collectVendorSkills` (answer → skill installs / vendor names), `applyDefaults`, and `findSkillOption`/`listSkillAddresses` (resolve `add <category>:<skill>`).

**`lib/manifest.ts`** parses/validates `manifest.json` and each `module.json`. `parseManifest` accepts `schemaVersion` 1 or 2 and, for v2, validates the `wizard` block via `parseWizard` — a malformed wizard hard-fails naming the offending section/question/option (never silently falls back to v1). `resolveModules(manifest, selected)` computes the full ordered install set: always includes `pharn-core`, adds transitive `dependsOn`, and enforces `exclusiveWith` (glob-aware; a module in the same dependency chain is never a conflict — that's how a stack pack and its React base coexist). `categorizeModules` keeps `kind:"skill-category"` modules out of the methodology multiselect.

**`lib/installer.ts` → `fetchAndInstall`** is the shared core used by init/add/update: clone the repo (`lib/repo.ts`, degit to a temp dir), read the manifest from the cloned commit, resolve modules, copy each module's `installs` (`lib/install-modules.ts` → `installModule`), and — for v2 — **selectively** copy the answered skills via `installSkills` (each `from` → `.claude/skills/<basename>/`, siblings never touched). `assertSkillSourcesExist` validates **every** skill source up front so a bad path fails before any file is written (no partial installs). When a constitution variant is given, `materializeCore` writes the memory bank + `CONSTITUTION.md`. Best-effort commit SHA via the GitHub API.

**`lib/validate.ts` is security-sensitive.** Module names, versions, `installs`/skill paths, and wizard values are validated against strict regex allowlists (`MODULE_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`, `WIZARD_VALUE_RE`), checked for `..`, and rejected on control chars. `install-modules.ts` additionally guards every copy (modules and skills) with `safeJoin` so nothing escapes its base dir. The manifest `schemaVersion` must be exactly `1` or `2` — anything else hard-fails by design so old CLIs don't guess at a new schema. Remote fetches use `redirect: 'error'`, an 8s timeout, and a 256KB body cap. Preserve these invariants.

**`lib/pharn-config.ts`** reads/writes `pharn.config.json` (`pharnVersion`, `skillsVersion`, `repo`, `commit`, `constitution`, `modules[]`, `installedAt`, plus the v2-only additive fields `stackAnswers` (questionId → value, incl. `"skip"`), `installedSkills[]` (`{skill, from}`), and `vendorSkills[]`). Schema is additive — legacy configs omit the v2 fields. `add` and `update` re-resolve and update it in place; neither touches `CONSTITUTION.md`.

**`pharn add` addressing.** `add <module>` installs a whole methodology module / stack pack (v1 + v2). `add <category>:<skill>` (v2 only, e.g. `add orm:prisma`) maps `<category>` → `pharn-skills-<category>`, resolves the wizard option, and installs just that skill: already-installed → no-op; a different sibling of the same category already installed → confirm before installing alongside (appends to `installedSkills`, **never** edits `stackAnswers`); unknown → lists valid addresses. `pharn update` re-resolves `installedSkills` against the new wizard and drops (reporting, never guessing) any `from` path that no longer exists upstream.

## Testing

Tests live in `tests/*.test.ts` (vitest, node env). `tests/helpers.ts` provides `stubProcessExit` (turns `process.exit` into a throwable `ProcessExit`), `useTmpDir`, and `CANCEL`. The lib tests build fake fetched-repos on disk to exercise copy/materialize without network. When changing behavior, update the matching test before touching code.

## Documentation discipline

`docs/` is user-facing and kept in sync with code. Do not document unimplemented behavior without marking it **Coming soon** or linking `docs/roadmap.md`.
