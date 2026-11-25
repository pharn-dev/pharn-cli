# CLAUDE.md

Guidance for Claude Code in this repository. Flows: [`docs/architecture.md`](docs/architecture.md); each guard's "why" is in its module.

## What this is

`pharn` is an interactive CLI that installs [PHARN](https://github.com/pharn-dev/pharn-oss) into an existing project.
`pharn init` detects the project's archetypes (`ssr`/`backend`/`spa`/`lib`), downloads pharn-oss as a codeload tarball
(by default the newest verified release; `--ref main` takes the tip of `main`), copies the selected capabilities
(grillers and lenses) and the fixed product surfaces into `.claude/` and `pharn/`, and writes pharn.config.json and
pharn.records.json in that project. It is published on npm as `@pharn-dev/pharn` with one bin, `pharn`. Every command is
archetype-only: a pre-archetype (module) config is refused with "re-run `pharn init`". It targets Claude Code today.

## Commands

```bash
npm run dev -- init          # run the CLI from source via tsx
npm run build                # rm dist → tsc --noEmit → esbuild bundle → dist/index.js
npm run typecheck            # tsc --noEmit for src AND tests
npm run lint                 # eslint src tests scripts --max-warnings 0
npm run lint:md              # markdownlint-cli2 over docs/**/*.md + *.md
npm run format:check         # prettier check (`format` writes)
npm test                     # vitest run
npm run test:coverage        # vitest run --coverage (what CI runs)
npm run check                # format:check + lint + lint:md + typecheck + test
npx vitest run tests/install-capabilities.test.ts   # one file
PHARN_DEBUG=1 npm run dev -- init   # full error output for fetch/install failures
```

## CI guardrails (do not break)

- `.github/workflows/ci.yml` runs six gates as six separate jobs: `Format check`, `Lint`, `Markdown lint`,
  `Typecheck`, `Test`, `Build`. Each job's `name:` is a **contract with the `main` branch ruleset**, which lists those
  exact strings as required status checks. **Never rename one.**
- **Never matrix a required job**: a matrix renames its reported context and blocks every PR. Add a separately named,
  non-required job instead (that is what `Smoke (node floor)`, `node-floor.yml`, is).
- The ruleset also requires `floor`, `gitleaks` and `Analyze (javascript-typescript)` from other workflows, plus two
  checks no workflow here produces: `Socket Security: Project Report` and `Socket Security: Pull Request Alerts`, from
  the Socket GitHub App (if Socket renames one, edit the ruleset). `tests/ci-workflow.test.ts` cannot see the ruleset.
- Gates run on ubuntu-latest with Node 24 only. The Node floor is `engines.node` `>=24.2.0` (pharn-oss's floor CLIs
  refuse to run below it). `lib/node-floor.ts` `NODE_FLOOR` must equal it, and `init`/`update` refuse to run below it.

## Releasing

- The version bump travels in the feature PR: `npm version --no-git-tag-version X.Y.Z` plus a CHANGELOG section.
  Merging it to `main` is the release. `publish.yml` gates on a missing `v<version>` tag, then builds, publishes and tags.
- **No npm tokens exist anywhere.** Publishing uses npm Trusted Publishing (OIDC) only. If a token ever seems needed,
  the Trusted Publisher config is broken: fix it on npmjs.com and **never** add a secret.
- Only the `publish` job holds `id-token: write`, and it installs nothing. Only `release` holds `contents: write`.
- A new package name's first publish is a manual local `npm publish`. Full steps: [`docs/RELEASING.md`](docs/RELEASING.md).

## Conventions

- ESM only (`"type": "module"`, NodeNext). **Relative imports use `.js` extensions** even though the source is `.ts`.
- `strict` + `noUncheckedIndexedAccess`: index access is `T | undefined`, hence the `!` on validated indices.
- Filesystem work is synchronous `node:fs`; the exceptions are `writeFileAtomic`/`writeJsonAtomic` (`lib/atomic-write.ts`).
- **One colour rule**: every coloured string goes through `src/lib/color.ts` (`import pc from './color.js'`). One
  picocolors instance, decided by `styleText`'s stream check, the one `@clack/prompts` uses. Never import `picocolors`.
- Code invariants are eslint rules in `eslint.config.mjs`, each message naming its reason, and
  `tests/lint-rules.test.ts` proves that each fires. They cover: no `child_process`; `picocolors` only via
  `color.ts` (both bans also catch a literal `import('…')`); `sha256File` only in `hash.ts`; `isTTY` only inside
  `interactiveAllowed()`; `process.exit` only in `fatal-signal.ts` (all else throws a `CliError`; `runCli` reports it
  once); no `cpSync`/`cp`; and the per-module bans.
- Options are per command: `parseCliArgs` (`lib/cli-args.ts`, pure) runs one `util.parseArgs` and checks its tokens
  against `OPTIONS[].uses`, the table `--help` renders. It refuses an unknown or another command's option, a value on
  an on/off option, a repeated `--ref`/`--archetype`: one stderr line, exit 1, above `--help`/`--version`.
- Every prompt (`init`, `update`, `uninstall`, the bare `add`/`remove` pickers) exits 1 off a TTY, through the one
  `interactiveAllowed` predicate (`lib/capability-picker.ts`). `--yes` skips only what it names: `init --yes` never
  confirms an overwrite.
- P3: `index.ts` dispatches, each `commands/` file owns one verb, each `steps/` file one stage, and shared logic lives
  in `lib/`. Never import command→command or step→step.
- Comments: a module header plus "why" comments and named residuals. No incident ids or "used to…" stories; that
  history belongs in git and the CHANGELOG.

## Invariants (preserve them)

- **Containment.** Every fs access derived from untrusted input goes through `safeJoin` (lexical, `lib/validate.ts`).
  A recursive delete goes through `safeChildJoin`, which returns exactly one segment below the base.
- **Destination symlink walks.** Before any write or delete, `findSymlinkComponent` (`lib/symlink-guard.ts`) refuses a
  path that crosses a symlinked component, because `safeJoin` is lexical and copies/`rmSync` follow links.
- **Hard-link-safe writes.** Writes replace the file (`lib/atomic-write.ts`: exclusive temp, then `rename`), one by one
  via `applyWrites`; a new `settings.json` uses `COPYFILE_EXCL`. A hard link's other name is never written through.
- **The clone is data.** `lib/repo.ts` is the only producer of a clone. `lib/tar-extract.ts` writes only the paths
  `pharn-install.json` lists plus `CLONE_READ_FILES`, each a regular file under today's path rules; every other archive
  entry is skipped and never written, whatever its type. It requires the tree's `pharn-install.json` (a tree without
  one is refused) and verifies its raw sha256s before returning the tree, so a listed file that is missing or altered
  fails; every manifest `dest` must pass `isPharnOwnedPath`, never the manifest's own `installRoots`. Nothing downloaded is ever executed: pharn-oss's `models` rules exist here as a pinned copy
  (`lib/model-config.ts`), held to the vendored sha256-pinned checker by a differential test.
- **Allowlists for untrusted names.** Untrusted names, versions, tags and manifest fields are checked against
  `CAPABILITY_NAME_RE`, `VERSION_RE`, `COPY_FILENAME_RE`, `COMMIT_RE`, `RELEASE_TAG_RE` and the role/applies enums.
- **One unsafe-character set** (`lib/terminal-safe.ts`). Untrusted text is escaped where it is printed, value by value,
  never as a whole line (pharn's own colour codes use ESC).
- **Records are the proof.** Overwriting or deleting a file requires that its `contentHash` (`lib/hash.ts`, CRLF folded
  for text) equals its record in pharn.records.json. The store's stamp is diagnostics and never gates the baseline.
  A file with no record is never deleted.
  The one widening: `update` writes the hashes it is about to copy as the store's `incoming` map first, and a file equal
  to its `incoming` hash counts as recorded (`settleIncoming`), so an interrupted run heals on a plain re-run.
- **Back up before overwrite or delete.** What pharn cannot prove it wrote goes to `pharn/.backup/<ts>/` first (one
  `createBackup`, announced via `printBackupNotice`). `update` deletes only the directories of dropped capabilities.
  User data (`memory-bank/`) is never moved, and an existing `.claude/settings.json` is never overwritten.
- **Fail closed on release resolution.** `lib/release.ts` refuses (naming `--ref main`) when the latest release cannot
  be resolved or is malformed. It never floats to the tip of `main`.
- **Network bounds.** `redirect: 'error'`, a per-request deadline and a body cap on every fetch. The tarball has its
  own archive, headers-scanned, decompressed-bytes-scanned and bytes-written caps.
- **The project lock.** `init`/`add`/`update`/`remove`/`uninstall` take `pharn/.lock` before reading the config, hold
  it across every prompt and plan once; edits made meanwhile are caught at write time (hash, fingerprint, walk). Dry
  runs and readers (`list`, `status`) never take it.
- **Bounded local reads.** pharn.config.json, pharn.records.json and the lock are read through `readBoundedFile`
  (regular file, size cap, `O_NONBLOCK`), so a FIFO or a huge file never hangs or floods a command.
- **Config schema is additive within the support window** (P7): new keys are optional, and a legacy field loads
  while a CLI in the window (the current minor and the previous one) still writes or reads it. Each compatibility shim
  names its removal version in a code comment and the CHANGELOG, and is removed on that version (the policy and the
  shim table: `docs/contributing.md`, "Support policy"). The CLI owns every key
  **except `models` and `seam`, which belong to pharn-oss**. They ride the spread verbatim, are never validated at
  load, and `seam` is never written. Never add a model/effort/stage rule the vendored checker does not have.
- **`--json` reports keep their `schemaVersion: 1` bytes.** A new key is additive and **absent when empty**, so the
  default output stays byte-identical. Stdout carries exactly one object, and diagnostics go to stderr.

## Module map

- `src/index.ts`: dispatch only. `lib/cli-args.ts`: the command/option tables, help text and the argv parse (`init` default).
- `commands/`: one verb each (`init`, `add`, `remove`/`rm`, `update`, `list`, `status`, `uninstall`).
- `steps/`: init stages (`node-prereq`, `prereqs`, `archetype-summary`, `overwrite-check`, `install-archetype`), `add-picker`.
- Fetch boundary: `fetch-capped` (the one bounded GET), `release` (which commit), `repo` + `tar-extract`, `skills-version`,
  `min-cli-gate`, `upstream-manifest` (the upstream install manifest's one parser), `capability-index` (manifest →
  typed index), `upstream-models`.
- Selection: `detect-archetype` + `archetype` (detection), `resolve-capabilities`, `merge-capabilities`,
  `capability-address`, `capability-groups`/`capability-picker`.
- Install: `install-capabilities` (the copy), `install-manifest` (the one expected-path set), `install-surfaces`,
  `layout`, `absent-surfaces`, `write-targets`, `init-plan`, `init-report`.
- Update engine: `update-plan` (read-only planner) → `update-decision` (the 6-row table) → `apply-update` →
  `update-next` (next state); `update-render` (notes), `update-report` (`--json`), `executable-unit`,
  `orphans`, `capability-removal`/`capability-dir`.
- Records and backups: `install-records`, `hash`, `dest-drift`, `backup`, `removal-backup`, `uninstall-plan`.
- Config: `pharn-config` (read/write/validate), `model-config` (pinned checker copy), `model-config-format`, `models-update`,
  `older-cli` (the warning when this CLI is older than the config's `pharnVersion`).
- Versions: `semver` (numeric-core ordering), `version-status` (ahead/outdated), `node-floor` (`NODE_FLOOR` and its verdict).
- Safety: `validate`, `symlink-guard`, `terminal-safe`, `bounded-read`, `atomic-write`, `project-lock`, `deadline`, `fatal-signal`.
- Reporting: `status-report`, `json-report` (the one serializer), `diff` (drift), `hook-wiring`, `cli-error`, `report-error`,
  `unknown-capabilities` (refused upstream names), `format`, `color`, `banner`.
- Project files: `gitignore`, `prettierignore`, `ignore-file`; proxy: `proxy-env`, `proxy-env-format`.
- Shared: `constants` (repo coordinates, install paths); `src/types.ts`, `src/version.ts`.

## Testing

- Vitest, node env. Lib tests are `tests/*.test.ts`; command suites are `tests/commands/` (`init`, `init-dry-run`, `add`,
  `remove`, `update`, `update-dry-run`, `update-interrupted`, `status`, `list`, `uninstall`, `lock`, `clone-cleanup`, `older-cli`). Update the test first.
- A command suite runs the real `run<Command>()` on a temp project via `tests/support/harness.ts`. Only two boundaries
  are replaced: global `fetch`, which serves a real codeload tarball (`tests/support/tar-fixture.ts`), and
  `@clack/prompts` (`tests/support/clack-stub.ts`), where an unscripted prompt throws.
- No test `vi.mock`s a `src/` module (`tests/index.test.ts` excepted). The coverage floors in `vitest.config.ts` are
  90/85/90/90 (statements/branches/functions/lines).
- `tests/helpers.ts` has `stubProcessExit`, `useTmpDir`, `CANCEL`. A fake clone must respect the clone invariant (no links).
- `tests/dist-smoke.test.ts` builds the shipped bundle with `scripts/build.mjs` and runs it (bundle-only regressions).
- Vendored pharn-oss files in `tests/fixtures/pharn-oss/` are byte-for-byte, sha256-pinned; refresh per `docs/contributing.md`.
- CI sets `CI=1`, which turns colour on: run `CI=1 npx vitest run` before pushing a test that matches coloured text.

## Documentation discipline

`docs/` is user-facing and kept in sync with the code (P4): cite real commands, flags and config fields, and mark
anything unimplemented **Coming soon** or link `docs/roadmap.md`. The root `ARCHITECTURE.md`, `CONSTITUTION.md`,
`THREAT-MODEL.md` and `LIMITS.md` are human-owned and hook-protected: never edit them (`ARCHITECTURE.md` is
content-hash pinned).
