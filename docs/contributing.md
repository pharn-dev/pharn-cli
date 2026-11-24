# Contributing to pharn

Development guide for the pharn package. This is the full guide; the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) is the quick-start pointer.

## Setup

```bash
cd pharn-cli
npm install
```

## Scripts

| Script                        | Purpose                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Run CLI via tsx, e.g. `npm run dev -- init`                                                     |
| `npm run build`               | Compile `src/` to `dist/`                                                                       |
| `npm run build:install-local` | Build and symlink `pharn` into every local `test-*/` app's `node_modules` (no-op if none exist) |
| `npm run test`                | Vitest (single run)                                                                             |
| `npm run test:watch`          | Vitest watch mode                                                                               |
| `npm run test:coverage`       | Coverage report                                                                                 |
| `npm run typecheck`           | `tsc` for src and tests                                                                         |
| `npm run lint`                | ESLint on `src/`, `tests/`, `scripts/` — fails on any warning                                   |
| `npm run format`              | Prettier write                                                                                  |
| `npm run format:check`        | Prettier check (CI-friendly)                                                                    |
| `npm run lint:md`             | markdownlint over `docs/**/*.md` and root `*.md`                                                |
| `npm run check`               | All of the above except `build`, without the coverage gate                                      |

From a `test-*/` directory (which needs its own `package.json`) after `build:install-local`:

```bash
npx @pharn-dev/pharn init
```

Published package `@pharn-dev/pharn` exposes a single `pharn` bin (see `package.json`).

## Quality gates

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs these gates on every pull request and on pushes to `main` — all must pass:

```bash
npm run format:check   # job "Format check"
npm run lint           # job "Lint"
npm run lint:md        # job "Markdown lint" — markdownlint-cli2 over docs/ and root *.md
npm run typecheck      # job "Typecheck"
npm run test:coverage  # job "Test" — vitest with enforced coverage thresholds
npm run build          # job "Build" — typecheck + esbuild bundle
```

Each gate is a **separate job**, so it reports its own status check and a failure in one never hides a failure in another. The job names above are the exact contexts the `main` branch ruleset requires, so renaming a job also means updating the ruleset — [`tests/ci-workflow.test.ts`](../tests/ci-workflow.test.ts) fails if the workflow side drifts.

**Code invariants are lint rules.** `eslint.config.mjs` holds the rules `src/` must keep, each with a message that names its reason: no `child_process`; `picocolors` only through `src/lib/color.ts` (both also as a dynamic `import('…')` of a literal name); no `sha256File` (`src/` compares with `contentHash`); `isTTY` read only as an argument to `interactiveAllowed(...)`; `process.exit` only in `src/lib/fatal-signal.ts` (everything else, the argv refusals included, throws a `CliError`, which `runCli` in `src/index.ts` reports once); plus one rule per single-owner module (the error reporter, the terminal-safe character set, the symlink walk, the clone producer, and the import bans of `diff.ts`, `executable-unit.ts` and `update.ts`). They fail `npm run lint` (job "Lint"); [`tests/lint-rules.test.ts`](../tests/lint-rules.test.ts) lints a planted violation of each against the real config. A new invariant of that kind is a row in the config's `INVARIANTS` table, not a test that reads source text.

Gates run on **ubuntu-latest with Node 24 only**. Two support claims are therefore wider than what CI tests, and both are deliberate — stated here rather than quietly implied:

| Claim                                          | Tested                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engines.node: ">=24.2.0"`                     | Node 24 + a smoke job on 24.2.0 | The floor is the one pharn-oss's floor CLIs refuse below (their `import.meta.main` gate used to skip every check on an older Node). The separate `Smoke (node floor)` workflow (`.github/workflows/node-floor.yml`, not a required check) installs the packed CLI on exactly the floor and runs `--version`/`--help`; the test suite itself runs on Node 24's latest, never on 24.2.0. `tests/engines.test.ts` fails if a runtime dependency declares a higher floor, or if its shipped code uses a Node API newer than ours from a measured list (today: `util.styleText` with an array of formats, 20.13.0+), and pins the smoke job's `FLOOR` to `package.json`; `tests/node-floor.test.ts` pins the runtime check (`NODE_FLOOR`) to it |
| No `os` field, so Windows is implied supported | ubuntu only                     | The `win32` branches of `toPosix` (`src/lib/validate.ts`) and the separator handling in `symlink-guard` never execute in CI — `tests/symlink-guard.test.ts` calls this out as PLATFORM-LATENT. The CRLF line-ending fold in `lib/hash.ts` is exercised with CRLF fixtures and a real `git -c core.autocrlf=true` checkout on Linux, never on Windows itself                                                                                                                                                                                                                                                                                                                                                                                |

**Do not close either gap by adding a `strategy.matrix` to one of the six existing jobs.** GitHub renders a matrixed job's context as `<name> (<value>)`, so `Test` would stop being reported and every PR would hang blocked on a required context nothing produces — the exact incident [`tests/ci-workflow.test.ts`](../tests/ci-workflow.test.ts) exists to prevent. A separate, additionally-named job (`Test (node floor)`, `Test (windows)`) leaves the six required contexts byte-identical and is the safe shape.

`npm run check` runs `format:check` + `lint` + `lint:md` + `typecheck` + `test` as a single local pre-push command. It covers every gate above **except `build`**, and it runs `test` rather than `test:coverage` — so it does not enforce the coverage thresholds the `Test` job does. A green `check` is the strongest single local signal, not a proof that CI will be green.

Three more workflows report required checks: `floor` (the deterministic PHARN floor), `gitleaks` (secret scanning), and `Analyze (javascript-typescript)` (CodeQL, also on pushes to `main` and weekly). The `main` ruleset also requires two Socket Security checks, `Socket Security: Project Report` and `Socket Security: Pull Request Alerts`; no workflow in this repo produces them (the Socket GitHub App reports them), so they are not in the workflow-derived list or in `REQUIRED_CONTEXTS` in `tests/ci-workflow.test.ts`. If a Socket check name changes, the ruleset must be edited.

## Branch & commit style

- Branch with a `feat/…`, `fix/…`, or `docs/…` prefix.
- Commit in [Conventional Commits](https://www.conventionalcommits.org/) style, one logical change per commit.
- Open an issue first for any non-trivial change — PHARN is small-surface on purpose.

## Support policy

Which old installs, configs, outputs and CLI versions the CLI must handle, and for how long. Decided 2026-11-11 (CORE-186); it governs every release from v0.20.0. The user-facing summary is [Support policy](support-policy.md); keep the two in step.

### The supported window: the current minor and the previous one

`update`, `add`, `remove`, `list`, `status` and `uninstall` support an install written by the current minor or the previous one: v0.20.x handles installs from 0.19.x and 0.20.x, v0.21.x those from 0.20.x and 0.21.x. Code that exists only for an install, config shape or project file older than that is a **compatibility shim**, and it is retired on the version it names (see [Shims to retire](#shims-to-retire)).

The window also binds the other way: the previous minor's CLI must still read the config the current one writes, so a field it needs keeps being written until it leaves the window. That is why writing `modules: []` outlived the other legacy fields: 0.19.x needs it, so `init` wrote it until v0.21.0.

### An older install gets one message: re-run `pharn init`

An install outside the window gets one clear message to re-run `pharn init`, never a silent misbehaviour or a stack of per-shim notes. `init` is the way back in: it reads the previous `pharn.config.json` tolerantly and carries the capabilities added with `pharn add` over as `manual` (`lib/init-plan.ts`). The refusal of a pre-archetype (module) config is the existing example (`lib/pharn-config.ts`).

So retiring a shim has a precondition: the shape it handled must either still work through the general path, or be met by that message. If neither holds, the shim is not ready to go.

### Every shim names its removal version

A compatibility shim names the version that removes it, in a code comment at the shim (`removed in vX.Y.0`) and in the CHANGELOG line of the release that adds it. "Kept for one release" is not a version. Its removal is a `### Removed` line in the CHANGELOG that names the last CLI that handled the path (for example "0.19.x is the last `pharn` that reads a root `.pharn.lock`"). The shim's tests are rewritten to assert the new behaviour, never deleted: the `Test` job's test-integrity check fails a PR that drops a test or a test title.

### `--json` reports: `schemaVersion` 1 stays additive

A new key is optional and **absent when empty**, so the default output stays byte-identical. Removing or renaming a key, or changing its type or meaning, is a breaking change: it bumps `schemaVersion`, with a CHANGELOG line. A JSON report is not a shim, so the window does not apply to it: `schemaVersion` 1's keys stay until a bump.

### The config schema: additive within the window

A new `pharn.config.json` key is optional. Legacy fields load, and are kept on read, while a CLI inside the window still writes or reads them; each leaves on its named version. `models` and `seam` belong to pharn-oss and are outside this rule: `pharn` carries them verbatim and never adds a rule its vendored checker does not have.

### Mixed CLI versions in one team

`pharn.config.json` records `pharnVersion`, the CLI that last wrote it (`init`, and `update` when it writes). A CLI older than the config's `pharnVersion` (major.minor) **warns** before it writes, and does not refuse. `src/lib/older-cli.ts` decides it (`olderCliWarning`, pure) and prints it (`warnIfOlderCli`): every writer calls it right after reading the config under the lock, before its first prompt or write (`init` on the config it replaces), and `status` and the dry runs call it at the same point. It is one line on stderr, so a `--json` stdout stays byte-identical. A `pharnVersion` that is absent or not a `VERSION_RE` string never warns. The warning only protects against CLIs released after it lands; 0.19.x and older have no such check.

### The `flat` layout

The `flat` layout was deprecated in v0.20.0 and is removed in v0.21.0: the maintainer shortened the window from the announced v0.22.0. 0.20.x is the last CLI that handles it. A config not recorded at `pharn` (`"flat"`, or no `layout` key) meets the one message: `loadArchetypeConfig` refuses it with `FLAT_LAYOUT_MESSAGE` (`src/lib/pharn-config.ts`), and `init` is the way back. A clone without `pharn/pharn-contracts` is refused by `detectLayout` (`src/lib/layout.ts`). `init` and `update` keep writing `layout: "pharn"`, because 0.20.x reads an absent key as `flat`. `src/lib/install-surfaces.ts` keeps the old root paths in the record-key bound (classification only, nothing installs there), so a flat install's recorded top-level copies, and a pre-7.0 root doc, stay orphans that `status` lists and `uninstall` removes by hash, instead of records dropped without a word.

### Shims to retire

| Remove in | Shim                                                                                             | Where                                                                                                                                                                                                                                                                                                                       | What it handles                                                                                                                             | Ticket |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| v0.20.0   | The legacy root lock `.pharn.lock`                                                               | Removed: `LEGACY_LOCK_FILE`, `LEGACY_CORPSE_RE`, `legacySite`, `checkLegacyLock` and the corpse sweep in `src/lib/project-lock.ts`, and the `.pharn.lock` `.gitignore` hint in `src/lib/root-migration.ts`                                                                                                                  | A root lock taken by `pharn` 0.13.0 or older                                                                                                | C6.2   |
| v0.20.0   | The `.pharn-backup/` notice                                                                      | Removed: `LEGACY_BACKUP_DIR` and `legacyBackupNotice` in `src/lib/backup.ts`, and the `.pharn-backup` `.gitignore` hint in `src/lib/root-migration.ts`                                                                                                                                                                      | A root backup directory written by `pharn` 0.13.0 or older (never deleted, only noticed)                                                    | C6.2   |
| v0.20.0   | The pre-0.7.0 `models` conversion                                                                | Removed: `LEGACY_MODEL_ALIASES`, the old defaults and the conversion in `src/lib/models-update.ts`; its notes in `src/lib/update-render.ts` and `src/commands/status.ts`                                                                                                                                                    | A `models` block in the format `pharn` wrote before 0.7.0                                                                                   | C6.3   |
| v0.20.0   | The legacy fields `constitution`, `installedSkills`, `stackAnswers`, `isMultiTenant` in the type | `PharnConfig` in `src/types.ts`                                                                                                                                                                                                                                                                                             | They leave the documented type only; still loaded and kept on read (no behaviour change) until v0.21.0                                      | C6.4   |
| v0.21.0   | Writing `modules: []`, and the four legacy fields above                                          | Removed: the `modules: []` write in `src/steps/install-archetype.ts`, `PharnConfig.modules` and `LegacyConfigFields` in `src/types.ts`. `LEGACY_CONFIG_KEYS` in `src/lib/pharn-config.ts` keeps the five loading, pharn-owned and dropped by every write                                                                    | 0.19.x reads a config without a `modules` array as no config, and v0.20.0 is the first CLI that does not, so 0.19 had to read 0.20's config | C6.4   |
| v0.21.0   | The `flat` layout (moved up from v0.22.0)                                                        | Removed: the `flat` branch of `src/lib/layout.ts` (`detectLayout` now refuses, `layoutPaths`), `configLayout`, `flatDeprecationLines`, the `flat` member of `Layout` in `src/types.ts`, `add`'s layout gate, status's `LAYOUT` note and `layoutMismatch`, update's layout move. `plan.abandonedLayout` is a constant `null` | Installs recorded at, and clones shipping, the legacy root layout (deprecated in v0.20.0); now one "re-run `pharn init`"                    | C6     |
| v0.21.0   | `PHARN_ROOT_FALLBACK_DOCS`                                                                       | Removed: `PHARN_ROOT_FALLBACK_DOCS` in `src/lib/constants.ts` and `resolveTrustedDocs` in `src/lib/layout.ts`                                                                                                                                                                                                               | A pharn-oss clone older than 7.0.0 that still ships `THREAT-MODEL.md` and `LIMITS.md` at the root                                           | C8.3   |
| v0.21.0   | The root-footprint migration (moved up from v0.22.0)                                             | Removed: `src/lib/root-migration.ts` (the root-doc deletion, the user-data hints, the `.pharn/` notice, the `.pharn/` `.gitignore` hint) and its callers. `plan.rootMigration` is a constant `null`                                                                                                                         | A `pharn`-layout install made from a pharn-oss older than 7.0.0 (its root docs are now ordinary orphans)                                    | C6     |
| v0.21.0   | The derivation fallback for a tree without `pharn-install.json`                                  | Removed: the derivation in `src/lib/install-manifest.ts`, the frontmatter index in `src/lib/capability-index.ts`, the root config read in `src/lib/upstream-models.ts`                                                                                                                                                      | A pharn-oss release older than 7.21.0, which ships no install manifest                                                                      | C8.3   |

The v0.20.0 rows, the `modules` row of v0.21.0 and the `flat` and root-footprint rows are tickets of epic C6 (CORE-155); the last two moved up from v0.22.0 by the owner's decision. The `PHARN_ROOT_FALLBACK_DOCS` and derivation rows are C8.3 of epic C8 (CORE-157), retired in v0.21.0 instead of v0.22.0 by the owner's decision. Every row above is retired: as of v0.21.4 no compatibility shim is open. The change that retires a shim removes its code comment with it.

## Project layout

```text
pharn-cli/
  src/
    index.ts              CLI entry, command routing
    commands/             init, add, remove, update, list, status, uninstall
    steps/                init stages (prereqs, node-prereq, overwrite-check, archetype-summary, install-archetype), add-picker
    lib/                  install-capabilities, install-manifest, capability-index, resolve-capabilities, detect-archetype, node-floor, release, archetype, layout, repo, tar-extract, diff, skills-version, min-cli-gate, semver, older-cli, pharn-config, model-config(-format), models-update, upstream-models, install-records, update-decision, update-render, apply-update, merge-capabilities, dest-drift, backup, atomic-write, project-lock, proxy-env(-format), symlink-guard, capability-address, capability-groups, capability-picker, unknown-capabilities, cli-error, report-error, hash, validate, constants, banner, format
    types.ts              Archetype / CapabilityEntry / Selection / PharnConfig
  tests/                  vitest specs
  docs/                   user + maintainer documentation
  scripts/               build.mjs, install-local.mjs
```

See [Architecture](architecture.md) for the architecture in depth (the archetype install flow, capability resolution, and the update engine), and [`CLAUDE.md`](../CLAUDE.md) for the invariants.

## Security-sensitive files

`lib/validate.ts` and `lib/install-capabilities.ts` handle the untrusted remote input that reaches the filesystem (capability names, install paths). They are not the whole boundary: `lib/tar-extract.ts` parses attacker-controlled archive headers, `lib/upstream-manifest.ts` parses the untrusted `pharn-install.json`, `lib/unknown-capabilities.ts` strips control characters from upstream text before display, and `lib/install-records.ts` and `lib/project-lock.ts` parse local-but-user-editable sidecars. Preserve their invariants when editing:

- Strict regex/enum allowlists (`CAPABILITY_NAME_RE`, `VERSION_RE`, `COPY_FILENAME_RE`, `COMMIT_RE`, the `role`/`applies` enums), `..` rejection, and control-char rejection.
- `safeJoin` (in `lib/validate.ts`) guards every read/copy so nothing escapes its base directory; `install-capabilities.ts` adds a symlink-aware backstop at the write sites and rejects symlinked sources.
- Remote fetches (`lib/skills-version.ts`, `lib/release.ts`) use `redirect: 'error'`, an 8s timeout, and a body cap (256KB for `SKILLS_VERSION`, 1MiB for a release object).
- A new install (`pharn init`) defaults to the newest verified pharn-oss release (`DEFAULT_INIT_REF`, `lib/release.ts`); `update`/`add`/`status` follow the channel the config records, and an absent `ref` means the tip of `main`. The release resolve fails closed: a release that cannot be resolved refuses the command and never falls back to the tip of `main`.
- The repo download (`lib/repo.ts`) has its own, larger bounds: a 60s timeout, a 32MB archive cap, a 128MB extracted cap, and a 20,000-entry cap — enforced twice, including at `gunzipSync`.

### pharn-oss's `models` rules — a pinned copy

pharn-oss owns the `models` schema of `pharn.config.json`, and its checker,
`pharn/floor/check-model-config.mjs`, ships into every install. The CLI cannot call it — it never
executes a file it installs (`THREAT-MODEL.md` §1) — so `src/lib/model-config.ts` is a copy of that
checker's `validate` and `resolve` rules, and nothing more. `tests/model-config-parity.test.ts` keeps it
that way: it runs the real checker, vendored byte-for-byte at
`tests/fixtures/pharn-oss/check-model-config.mjs` and pinned by sha256, over a corpus, and fails on any
verdict, RED line or resolution that differs from the copy's. It also reads the stage, alias, id and
effort sets out of the checker's source, and fails if the corpus stops reaching one of the checker's
RED kinds.

When pharn-oss changes its checker:

1. Copy `pharn/floor/check-model-config.mjs` from pharn-oss `main` over
   `tests/fixtures/pharn-oss/check-model-config.mjs`, unedited, together with every pharn-oss module it
   imports (today `pharn/floor/frontmatter-core.mjs`, vendored beside it), so the checker loads.
2. Update `PINNED_SHA256`, and the commit and `SKILLS_VERSION` in the comment above it, in
   `tests/model-config-parity.test.ts`, and the sha256 pin of each imported module beside it.
3. Run `npx vitest run tests/model-config-parity.test.ts`, and change `src/lib/model-config.ts` until it
   passes: port pharn-oss's change, never a rule of your own. If the checker gained a branch, extend the
   corpus to reach it.
4. If a released CLI would now reject pharn-oss's own block, release the new CLI first, then ask
   pharn-oss to raise `MIN_CLI` to it.

### The fetch boundary

`pharn` has **no dependency that fetches or unpacks remote content**. `src/lib/repo.ts` resolves the
branch head over the GitHub REST API (the bare commit id, read under a 1 KiB cap) and downloads that exact commit's tarball from
`codeload.github.com`; `src/lib/tar-extract.ts` unpacks it. Both are pharn's own code, and that is the
point: when the download and extraction were delegated, `THREAT-MODEL.md` had to state _measured
properties of a dependency_, which a version bump could move without any pharn test noticing.

If you change either file, the guarantees they carry are the ones `THREAT-MODEL.md` §2/§4b and
`LIMITS.md` §3a state — timeout, streamed-byte cap, decompressed-size cap, `redirect: 'error'`,
typeflag allowlist, `prefix`+`name` path reassembly, `..`/absolute rejection, single-root check,
`safeJoin` on every write, entry/byte caps, header checksums. Each has a test in
`tests/tar-extract.test.ts` or `tests/repo.test.ts`; keep them in step with the prose.

Two rules that are easy to get wrong:

- **Skip pax headers, do not judge them.** Every codeload tarball opens with a `pax_global_header`
  (typeflag `g`) whose single-segment name has no leading component to strip. Running the path rules
  over it fails the first block of every real archive — a bug no hand-made fixture would catch, which
  is why `tests/tar-extract.test.ts` builds its fixtures with one.
- **Reassemble the path before judging it.** ustar splits anything over 100 characters across the
  `prefix` and `name` header fields. Reading `name` alone yields a bare leaf that strip-1 then
  rejects, losing a large fraction of the tree rather than misplacing it.

## Test map

| Test file                                                                              | Behavior covered                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detect-archetype.test.ts` / `archetype.test.ts`                                       | Archetype detection from `package.json` names + file-tree signals                                                                                                                              |
| `capability-index.test.ts`                                                             | The capability index from `pharn-install.json` (unknown `applies` tokens seen, never installed)                                                                                                |
| `resolve-capabilities.test.ts`                                                         | Select capabilities by `applies` against detected archetypes                                                                                                                                   |
| `install-capabilities.test.ts`                                                         | Copy capability dirs + fixed product surfaces; symlink + path-escape guards                                                                                                                    |
| `commands/init.test.ts` / `commands/init-dry-run.test.ts`                              | `init` end to end (every refusal, the prompts, `--yes`, re-runs, carry-over, backups) and `init --dry-run [--json]`                                                                            |
| `commands/add.test.ts` / `commands/update.test.ts` / `commands/update-dry-run.test.ts` | `add` end to end (gates, picker, record merge, drift backup); `update` real run and `update --dry-run [--json]` (drift-safe re-resolve)                                                        |
| `update-decision.test.ts` / `install-records.test.ts`                                  | The pure update decision table + planner; the `pharn.records.json` store and its fail-closed validation                                                                                        |
| `backup.test.ts` / `apply-update.test.ts`                                              | `pharn/.backup/` creation + abort-before-touch; the per-file writer and its symlink refusals                                                                                                   |
| `commands/remove.test.ts` / `removal-backup.test.ts`                                   | `remove` end to end (and the refused `flat` config); which files are backed up before the delete                                                                                               |
| `capability-dir.test.ts` / `capability-removal.test.ts`                                | The shared capability-directory addressing and delete; the removal plan for capabilities `update` and `init` drop                                                                              |
| `commands/uninstall.test.ts` / `uninstall-plan.test.ts`                                | `runUninstall` end to end (refusals, confirm, lock, resumable failure); which recorded files may be deleted                                                                                    |
| `orphans.test.ts`                                                                      | Which recorded files are orphaned (install roots, dropped/frozen excluded); the `ORPHANED` note                                                                                                |
| `commands/list.test.ts` / `commands/status.test.ts`                                    | Read-only inventory + version/drift audit                                                                                                                                                      |
| `diff.test.ts`                                                                         | `diffInstalledCapabilities` expected-set derivation + content compare, incl. a real `git -c core.autocrlf=true` checkout                                                                       |
| `hash.test.ts`                                                                         | The content hash: the CRLF→LF fold for text and the 8000-byte NUL sniff                                                                                                                        |
| `layout.test.ts`                                                                       | `detectLayout` (refuses a `flat` clone) / `layoutPaths`                                                                                                                                        |
| `validate.test.ts`                                                                     | Allowlists, `..`/control-char rejection, and `safeJoin` containment                                                                                                                            |
| `pharn-config.test.ts`                                                                 | Round-trip `pharn.config.json`; `loadArchetypeConfig` legacy reject                                                                                                                            |
| `skills-version.test.ts`                                                               | Read/fetch + validate `SKILLS_VERSION`                                                                                                                                                         |
| `prereqs.test.ts`                                                                      | `.git`-present gate                                                                                                                                                                            |
| `overwrite-check.test.ts` / `install-manifest.test.ts`                                 | Pre-install write-target conflict check; the shared install manifest (mirror-pinned to `installCapabilities`) and its per-surface accounting (`absentInstallSurfaces`)                         |
| `absent-surfaces.test.ts`                                                              | The shared wording of the not-shipped-upstream report (`init`'s warning, `update`'s `NOT SHIPPED` note)                                                                                        |
| `model-config.test.ts` / `model-config-parity.test.ts`                                 | pharn-oss's `models` rules as copied; the copy pinned to pharn-oss's own checker                                                                                                               |
| `models-update.test.ts` / `upstream-models.test.ts`                                    | `update`'s rows for the `models` block; reading pharn-oss's block                                                                                                                              |
| `confirm.test.ts` / `repo.test.ts` / `banner.test.ts` / `format.test.ts`               | helpers; the codeload fetch boundary; banner; format                                                                                                                                           |
| `tar-extract.test.ts`                                                                  | The ustar reader: strip-1, pax skip, prefix reassembly, and every rejection                                                                                                                    |
| `index.test.ts`                                                                        | argv dispatch: the per-command option allowlist, the arity gate, and their exit codes                                                                                                          |
| `project-lock.test.ts` + `-break` / `commands/lock.test.ts`                            | The single-writer lock: acquire/release, stale-break single-winner, and which commands take it                                                                                                 |
| `min-cli-gate.test.ts` / `semver.test.ts`                                              | The `MIN_CLI` forward-compat gate and its version comparison                                                                                                                                   |
| `older-cli.test.ts` / `commands/older-cli.test.ts`                                     | The older-CLI warning's major.minor comparison; that each writer, `status` and the dry runs print it on stderr                                                                                 |
| `node-floor.test.ts` / `node-prereq.test.ts`                                           | The Node floor verdict (fail-closed) and the `init`/`update` preflight                                                                                                                         |
| `release.test.ts`                                                                      | The verified-release resolver: tag/commit resolution, every fail-closed refusal, the channel                                                                                                   |
| `fetch-capped.test.ts`                                                                 | The one bounded GET: `redirect: 'error'`, the deadline, the byte cap, released bodies                                                                                                          |
| `proxy-env.test.ts` / `proxy-env-format.test.ts`                                       | Proxy detection and the warning's rendering + redaction                                                                                                                                        |
| `merge-capabilities.test.ts` / `dest-drift.test.ts`                                    | The 9-row membership table; `add`'s destination-drift partition (drift vs unsafe)                                                                                                              |
| `capability-address.test.ts` / `capability-groups.test.ts`                             | `<role>:<name>` parsing; the grouped inventory rendering                                                                                                                                       |
| `capability-picker.test.ts` / `archetype-summary.test.ts`                              | The interactive picker and its TTY gate; the init summary step                                                                                                                                 |
| `init-report.test.ts`                                                                  | The `init --dry-run --json` object and its projection                                                                                                                                          |
| `write-targets.test.ts`                                                                | The shared write-target/label plan behind the overwrite prompt, `init --yes` and the dry run                                                                                                   |
| `atomic-write.test.ts` / `report-error.test.ts`                                        | Temp-then-rename writes; the error reporter and its `PHARN_DEBUG` split                                                                                                                        |
| `cli-error.test.ts`                                                                    | The one error type and the top-level catch: each `CliError` form's stream and exit code; an unexpected error exits 1 with no stack unless `PHARN_DEBUG=1`                                      |
| `commands/clone-cleanup.test.ts`                                                       | The temp clone is removed on every exit path of `add`, `update` and `status` (refusal, thrown failure, cancel, `--strict`)                                                                     |
| `unknown-capabilities.test.ts` / `constants.test.ts`                                   | Control-char stripping for refused upstream names; the path constants                                                                                                                          |
| `ci-workflow.test.ts` / `publish-workflow.test.ts`                                     | The nine required status-check names are produced; publish.yml's one `contents: write`, and its `Decide` step executed                                                                         |
| `lint-rules.test.ts` / `dependency-overrides.test.ts`                                  | Each `src/` lint rule fires on a planted violation and each exemption stays silent; every `overrides` floor holds in the lockfile                                                              |
| `repo-signals.test.ts` / `model-config-format.test.ts`                                 | Fetch abort/cleanup signals; the `models` render                                                                                                                                               |
| `dist-smoke.test.ts`                                                                   | The built bundle, run with `node`: `--version`, `--help`, option refusals, the modules `--version` loads, and every command exiting on its own, promptly, with its code                        |
| `build-config.test.ts`                                                                 | The esbuild options `scripts/build.mjs` exports: `node24`, chunk splitting, chunks flat in the outdir                                                                                          |
| `commands/*.test.ts` (+ `support/harness.ts`)                                          | One behaviour suite per command against a real temp project: only `fetch` is stubbed (serving a real codeload tarball) and `@clack/prompts` at the prompt boundary; no `src/` module is mocked |

When changing behavior, add or update tests before docs.

## Documentation maintenance

Keep [`docs/`](./README.md) aligned with code when you change:

| Code change                                  | Update docs                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Install output or config shape               | [reference/pharn-config.md](./reference/pharn-config.md)                                               |
| Archetype detection or capability resolution | [commands/init.md](./commands/init.md), [getting-started.md](./getting-started.md)                     |
| New validation or warning                    | [troubleshooting.md](./troubleshooting.md)                                                             |
| New command or behavior                      | `commands/*.md`, [roadmap.md](./roadmap.md)                                                            |
| CLI `--help` text                            | [commands/init.md](./commands/init.md), [README.md](../README.md)                                      |
| Records store, lock, or backup behaviour     | [reference/pharn-records.md](./reference/pharn-records.md), [troubleshooting.md](./troubleshooting.md) |
| Option allowlist or exit codes               | [troubleshooting.md](./troubleshooting.md), the affected `commands/*.md`                               |
| Compatibility shim added or retired          | [Shims to retire](#shims-to-retire), [support-policy.md](./support-policy.md), the CHANGELOG           |

Do not document behavior that is not implemented without marking **Coming soon** or referencing [roadmap.md](./roadmap.md).

## Runtime diagnostics (Phargus)

[Phargus](https://github.com/pharn-dev/phargus) (`@pharn-dev/phargus` 0.2.x, a dev dependency, never shipped) samples the event loop, memory and GC of a CLI run. The agent reads `phargus.config.json` from the process's working directory, so run both scripts from the repository root:

```bash
npm run phargus:collect -- --port 0 --duration-ms 60000
npm run phargus:run -- init --dry-run --json
```

`phargus:run` builds `dist/` and runs it with `--import @pharn-dev/phargus/agent`, writing samples to `.phargus/raw.ndjson` every 250 ms. `phargus:collect` serves the collector and dashboard on loopback from the copied tools in `.phargus/tools/` (the `phargus-setup` skill's scripts). Captures under `.phargus/` are gitignored; the tools are tracked. The CLI serves no HTTP, so there are no request spans — only runtime samples. The `phargus-*` skills in `.agents/skills/` diagnose, compare and replay those captures.

## Debug flag

`PHARN_DEBUG=1` enables full error output for catalog fetch and install failures. Document new debug surfaces in [troubleshooting.md](./troubleshooting.md).

## License

By contributing, you agree your contributions are licensed under the repository's [Apache 2.0 license](../LICENSE).

## Related

- [Docs index](./README.md)
- [init command](./commands/init.md)
- [pharn.config.json](./reference/pharn-config.md)
