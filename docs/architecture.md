# Architecture

How the `pharn` CLI is put together, command by command. This is the maintainer's map. The user-facing behaviour of
each command is in [`commands/`](commands/), and the security-sensitive modules are listed in
[`contributing.md`](contributing.md#security-sensitive-files). The root `ARCHITECTURE.md` is PHARN's own spec, a
different document. Each module's header comment explains its own "why"; this page only connects the modules.

## Dispatch and options

`src/index.ts` dispatches to `commands/{init,add,remove,update,list,status,uninstall}.ts`. The argv contract lives in
`src/lib/cli-args.ts`: `parseCliArgs(args)` is a pure function that returns a refusal, text to print (`--help`,
`--version`) or the command with exactly the options object its `run<Command>` takes. `init` is the default command,
and `rm` is an alias of `remove`.

- **One table.** `OPTIONS` (each option's name, short alias, whether it takes a value, and per-command help text) and
  `COMMANDS` (name, aliases, positional) are the help data and the parser's configuration at once. The `util.parseArgs`
  options, the commands that take each option (`OPTIONS[].uses`) and each command's positional limit are all derived
  from them, so an option cannot be accepted without a help entry, or documented without being accepted.
- `util.parseArgs` runs once with `strict: false` and `tokens: true`, and the tokens are checked in order: an
  **unknown** option; an option this command does **not take** (only for a known command, so `pharn bogus --json` still
  says "Unknown command"); a **value on an on/off option** (`--json=false`); a **repeated** `--ref` or `--archetype`
  (parseArgs would keep the last silently); then the `--ref` (`latest` | `main`) and `--archetype` (an exact
  comma-separated list) values. `--no-drift` is declared as its own option; no other negation exists.
- Every refusal is one stderr line naming the offender as written (`JSON.stringify`-escaped) plus a pointer at
  `pharn --help`, exit 1. All of them sit above the `--help`/`--version` short-circuits, so `--help` licenses no bad
  sibling option. The unknown-command and positional-arity checks sit below them. Command words and option names are
  looked up in `Map`s, because they are untrusted argv and an object lookup would resolve `Object.prototype` keys.
- `--json` on `init` and `update` implies `--dry-run`, and `update --compact` implies `--json`, so no option needs a
  partner.
- `pharn <cmd> --help` prints only that command's options, rendered from the same tables as the full `USAGE`.

**The project lock first.** `init`, `add`, `remove`, `update` and `uninstall` take `pharn/.lock`
(`lib/project-lock.ts`) right after the Node floor and the git prerequisite — before they read `pharn.config.json` or
touch the network — and hold it to their last write, across the fetch, the plan and every prompt. So each plans
**once**, and a second writer is refused with the holder's command and pid ("it may be waiting for input in another
terminal"); a live same-host holder is never broken by age. Dry runs take no lock. What can still change while a prompt
is open — a hand-edit, another program — is checked at write time, not re-planned: `pharn.config.json` against the
fingerprint taken before its read (`assertConfigFingerprintUnchanged`, after the last prompt), each written file
against the hash the plan saw (`applyWrites`' `seen`; `update` refuses before its first write via `changedSince`), each
deleted directory's backup set re-read at the delete (`removalBackupsNow`) with its own symlink walk
(`deleteCapabilityDir`), and `uninstall`'s `delete` bucket re-classified (`reclassifyDeletes`).

**TTY gate.** `init`, `update`, `uninstall` and the bare `add`/`remove` pickers read `process.std*.isTTY` into the
shared `interactiveAllowed` predicate and exit 1 off a TTY, so a dead stream never answers a prompt. In `init` the gate
sits after the git prerequisite and before the lock; in the others it sits after the config load (so an uninitialized
directory gets its actionable error), under the lock, and before any network call.

- `update --yes` skips the confirm and nothing else.
- `init --yes` skips only the summary confirm. It installs only when none of its write targets exists
  (`refuseExistingTargets`, over the plan's targets). An existing `pharn.config.json` is refused before the fetch (`existingConfigRefusal`).
- `uninstall --yes` skips its one confirm.
- `remove` has no `--yes`: its named path never confirms, and the picker's one confirm is the destructive gate.

## `init`

`runInit` is the only init flow:

1. **Prerequisites.** `runNodePrereq` (the Node floor) runs first, then `runGitPrereq`. When an ancestor holds `.git`,
   the error names that root.
2. **Detection** (`lib/detect-archetype.ts`, `lib/archetype.ts`). It merges `package.json` dependency names with a
   bounded, symlink-safe walk of the file tree.
   - Structural signals are scoped to a base: the root, or exactly `apps/<x>` or `packages/<x>`. `next.config.*`
     means `ssr`. `route.*` under `app/` and `api/` dirs mean `backend`, but only with Next evidence in that base.
     Root `api/`, `migrations/` and DB-located `.sql` mean `backend` only with a root `package.json`, since the
     upstream backend lenses match JS/TS only.
   - `backend` reads `dependencies` only, so a dev-only server or DB package adds nothing. `ssr` and client UI also
     read `devDependencies`.
   - The walk skips caches and build output, and skips ecosystem dirs (`target`, `vendor`, `venv`) only where they
     belong to that ecosystem. It stops early once `ssr` and `backend` both hold. It is bounded by `WALK_LIMITS`; a
     truncated walk prints one "detection stopped early" line.
   - Detection returns one piece of evidence per archetype (a dependency or the first triggering path). It is
     display-only, passed through `terminalSafe`.
3. **Source** (`lib/release.ts`, `lib/repo.ts`). `resolveSource` decides which commit, and `fetchRepo(source)` downloads
   and extracts the codeload tarball into a temp dir that is removed in a `finally`. No command exits mid-run: a
   refusal, a failure or a cancel is thrown as a `CliError` (`lib/cli-error.ts`), so that `finally` (and the project
   lock's) runs first, and `runCli` in `src/index.ts` prints it once and sets `process.exitCode`. When the tree carries
   `pharn-install.json` (pharn-oss 7.20.0 and later), `fetchRepo` validates it and checks every declared file's raw
   sha256 before it returns the tree (see [The install manifest](#the-install-manifest-pharn-installjson)).
4. **Index and selection.** `parseCapabilityIndex` takes the capabilities from `pharn-install.json`, or, for a tree
   without it, reads each capability's `role`/`applies` frontmatter by pharn-oss's own rules. `resolveCapabilities`
   selects `universal` capabilities and those whose `applies` intersects the archetypes.
5. **Carry-over** (`lib/init-plan.ts`). The replaced config is read tolerantly. A config that exists but cannot be read
   is named in the summary, and nothing is carried. Otherwise `carryOver` applies `update`'s merge rules:
   - a `manual` entry the index still has is reinstalled as `manual`;
   - an entry upstream ships but this CLI cannot parse is kept verbatim and listed in `frozenCapabilities`;
   - a manual entry upstream dropped is dropped and named;
   - user-owned top-level keys (everything outside `CLI_OWNED_KEYS`, `seam` included) are copied across.
6. **Summary, plan, prompt.** The summary prints the archetypes and where they came from. After it is answered,
   `buildInitPlan` (`lib/init-plan.ts`) runs ONCE: the manifest, the destination pre-flight (`prepareInstall`), one
   `scanDest` over every manifest path (drift labels, the backup set and the hashes the writer compares with), the
   dropped capabilities' removals and the root migration. It returns the dry run's JSON-safe `report` and an `apply`
   half. `confirmWriteTargets` renders the plan's targets (default No). On a re-install it marks exactly the files
   `update` would skip: `(edited)`, `(no pharn record)`, `(differs from upstream)`. Dropped capabilities are listed
   under "will be DELETED".
7. **Install** (`steps/install-archetype.ts`) consumes the plan: the config fingerprint check, one `createBackup`
   (drift, the replaced config, and removed capabilities' files read again at the delete), the deletes, the copy
   (`installPrepared`, which does not re-run the pre-flight), then records, config, `.gitignore` and `.prettierignore`
   lines.

`--archetype <list>` replaces detection. Detection still runs and is shown as "(not used)", and the override is
recorded as `config.archetypes`, which `update` keeps. A re-run without the flag whose detection differs prints the
previously recorded archetypes.

**`init --dry-run [--json]`** runs steps 1–5 and `buildInitPlan`. That is read-only, and it is the same plan the real
run's prompt and install consume. It skips the TTY gate, both prompts, the lock and every write function.
`--json` prints one object (`lib/init-report.ts`, `INIT_SCHEMA_VERSION = 1`).

## The copy (`lib/install-capabilities.ts`)

- Every file is written by `update`'s per-file writer, `applyWrites` (`lib/apply-update.ts`): a symlink walk of the
  destination, then `copyFileAtomicSync` (an exclusive temp, then `rename`), so a hard-linked destination's other name
  keeps its bytes.
- `installCapabilityDirs` (used by `add`) pre-flights every selected source before any write, then writes each
  griller/lens dir's clone file list (`capabilityCloneFiles`).
- `installCapabilities` (used by `init`) writes exactly the install manifest (`collectExpectedInstallPaths`): the
  capability dirs and the fixed surfaces, which are product `pharn-*` commands and agents (never `pharn-dev-*`),
  `.cjs`/`.mjs` hooks (never `*.test.*`), the trusted docs, upstream's `LICENSE` (to a pharn-owned name), the
  product-loop boundary contract, `pharn-contracts/`, `pharn-core`, and `.dev/floor/` minus its tests and test fixtures.
- Both hand the writer the destination hashes `scanDest` saw (`init`: its plan's scan). A file edited between that
  scan and its write — for `init`, while a prompt was open — is backed up (one `createBackup`) and then written.
- A write that fails part-way names the files already written (the first ten, then a count) and writes no records and
  no config. The next run treats those files as unrecorded.
- `.claude/settings.json` is never overwritten or merged. When none exists, upstream's is created with
  `COPYFILE_EXCL` and its hash recorded, so `uninstall` can remove it unchanged. A `HOOKS` note lists what it wires.
- Every declared surface the clone does not ship is reported (`absentInstallSurfaces`): by `init` as a warning, by
  `update` as `NOT SHIPPED`, and by `status` as drift that fails `--strict`.
- The destination is guarded by `prepareInstall`, which runs once: in `init`'s plan, before any prompt (and inside
  `installCapabilities` for a caller without a plan). Between it and each write, the writer's own per-file walk is the
  backstop. It refuses a path through a symlinked directory or file, any manifest path whose type is in the way
  (the features README included), and a directory where `pharn.config.json`/`pharn.records.json` belong. A live
  `.claude/settings.json` link is allowed, since it is never written.

The install mirrors the clone's layout: `pharn` (everything under `pharn/`) or legacy `flat` (`lib/layout.ts`).

## The install manifest (`pharn-install.json`)

pharn-oss 7.20.0 and later declare what an install receives in `pharn-install.json` at the root of the tree (its schema
is pharn-oss's [`docs/install-manifest.md`](https://github.com/pharn-dev/pharn-oss/blob/main/docs/install-manifest.md)).
`lib/upstream-manifest.ts` is its one reader:

- **Read and validate.** A bounded read (4 MiB, regular file, non-blocking), then a strict check: `schemaVersion` must
  be `1` (anything else refuses and says to upgrade pharn); `skillsVersion` must equal `SKILLS_VERSION`; the layout
  must be the `pharn` layout this CLI knows; every capability `name`, `role` and `dir`, and every file `path`, `dest`,
  `sha256`, `policy` and `surface`, is held to an allowlist and to `safeJoin`; `dest`s are unique. Unknown keys are
  ignored (the schema is additive within version 1).
- **The outer bound.** Every `dest` must lie inside `isPharnOwnedPath` (`lib/install-surfaces.ts`): below `pharn/`
  inside a `pharn-*` entry or one of the layout's fixed roots, or below `.claude/<dir>/` inside a `pharn-*` entry (or a
  top-level hook in `.claude/hooks/`). `.claude/settings.json` may appear only as `if-absent`. Anything else — the
  project root, a `.git` path, `.claude/settings.local.json`, user data under `pharn/` — refuses the whole manifest.
  The manifest's own `installRoots` are never the bound. The record-key bound (`isInstallRootPath`, used by orphans,
  `uninstall` and `.prettierignore`) accepts the same paths, so a file installed into a surface this CLI does not name
  is updated, orphaned and uninstalled like any other, still gated by its record's hash.
- **Verify.** `fetchRepo` checks each declared file's raw-byte sha256 (`matchesRawSha256` in `lib/hash.ts`; the
  records' `contentHash` stays CRLF-folded) before it returns the tree. A mismatch refuses, and nothing is written.
- **Use.** The install set (`collectExpectedInstallPaths`), `add`'s file list (`capabilityCloneFiles`), the
  capability index, the settings copy and the `models` defaults come from it. An `applies` token outside this CLI's
  enum makes that capability `unknown`, as the frontmatter path does. `models.defaults` passes the same
  `checkModelsBlock` gate; `models.rules` and `installRoots` are type-checked and drive nothing, and
  `lib/model-config.ts` stays the one validator.
- **Fallback.** A tree without the file (every release before 7.20.0, the `flat` layout) is installed by the CLI's own
  derivation, unchanged. That fallback is removed in v0.22.0.

## Release channels (`lib/release.ts`)

- A new install defaults to the newest pharn-oss GitHub release (`DEFAULT_INIT_REF = 'latest'`). pharn-oss tags
  `v<SKILLS_VERSION>` only after every required post-merge check passed.
- It is resolved with two bounded GETs: `releases/latest`, then `commits/refs/tags/<tag>` (the full ref, so a branch of
  the same name cannot answer). Drafts, prereleases and malformed tags or SHAs are refused.
- Any failure is a `ReleaseResolveError` naming `--ref main`. It never floats to the tip.
- `fetchRepo` refuses a release whose `SKILLS_VERSION` is not its tag.
- `--ref main` follows the tip (`fetchCommitSha` asks for `commits/refs/heads/main`).
- The channel is recorded as config `ref`, and only the literal `"latest"` is ever written. `update`, `add` and `status`
  follow `channelOf(config)`, where an absent `ref` means `main`.
- **Ahead of the source**: an install newer than its channel offers. `versionStatus` is the one comparison. `update`
  then changes nothing unless `--force`, `status` reports it as ahead (not outdated), and `add` names the ways out.

## `add` (`commands/add.ts`)

`add <name>` or `add <role>:<name>` installs one capability as a manual override, recorded with `source: 'manual'`.

- It clones at the config's channel. The **version gate** refuses unless the clone's `SKILLS_VERSION` equals the
  config's (or its `pendingSkillsVersion`). The **layout gate** refuses unless the clone's layout equals
  `configLayout(config)`.
- `add` never stamps `skillsVersion` or `layout`, because it writes one capability, not the tree.
- Before the copy, `scanDest` backs up destination files whose content differs from the clone's. It refuses the whole
  install if a destination path crosses a symlinked component: the writer would refuse it only after the files before
  it landed, and such a path cannot be backed up.
- Records are merged keyed by the clone's file list, never a walk of the destination.

## `remove` (`commands/remove.ts`)

The inverse of `add`, with no clone and no network.

- It deletes one capability dir at the recorded layout (a strict child of its role subtree, via `safeChildJoin`) and
  drops its config entry.
- It refuses a target whose path crosses a symlink, right before the backup (the picker also before its confirm), and
  `deleteCapabilityDir` walks again at the delete. Everything runs under the lock, the picker's prompts included.
- Before deleting, it backs up every file it cannot prove is pharn's (`removalBackupSet`: unrecorded, edited, or all of
  them when the store is unusable).
- It prunes that capability's keys from `pharn.records.json` by key prefix. The trailing `/` is load-bearing.
- Removing an entry whose `source` is `'auto'` warns that `update` may reinstall it.

## `uninstall` (`commands/uninstall.ts`)

Offline. Without a usable records store it refuses.

- `planUninstall` puts every record key in one bucket: `outside` (not an install path), `unsafe` (a symlinked parent,
  which refuses the run), `absent`, `unverifiable`, `edited` (kept), or `delete` (hash equals the record).
- Flow, all under the lock: plan note, confirm, then the config fingerprint and the records store are checked and the
  `delete` bucket re-classified (`reclassifyDeletes`), it backs up the config, unlinks the `delete` bucket, removes dirs
  left empty, and unlinks the records and then the config last.
- A `HOOKS` note names settings entries that point at hooks the run removed.

## `update` (`commands/update.ts`)

**Plan, then write.** `buildUpdatePlan` (`lib/update-plan.ts`) is the read-only planner: index, merge, manifest,
per-file decisions, models, removals, orphans, hook wiring. It returns a JSON-safe `report` and an `apply` half.
`applyPlannedUpdate` writes in this order: backup, removals, writes, records, config. `--dry-run` rides the planner
alone and reaches no write function. `--dry-run --json` projects the report through `lib/update-report.ts`
(`schemaVersion: 1`).

**The real run plans once, before it asks.** Under the lock, it downloads once, plans, prints the membership changes,
and asks. A plan that changes nothing (`changesNothing`) is "Up to date": it asks nothing and writes nothing, and
`--dry-run --json` reports it as `status: "up-to-date"` with `plan: null`. After the confirm,
`applyConfirmed` refuses before the first write when `pharn.config.json` or any file the plan writes changed while the
prompt was open (a file now byte-identical to upstream is not a change), then applies the confirmed plan.

- **Membership** (`lib/merge-capabilities.ts`): the next set is `resolve(archetypes) ∪ manual`. Every change is named in
  a `CAPABILITIES` note. A source-less legacy entry is inferred once, here.
- **Per file** (`lib/update-decision.ts`, the 6-row table): missing → restore; identical → no-op; equals record →
  upgrade; else skip (`modified`, `unrecorded`, `unverifiable`). `--force` overwrites the skips after backing them up.
- **Withheld bump.** A run that skipped anything keeps the old `skillsVersion`/`commit`. When the only skips are the
  user's own edits it records `pendingSkillsVersion`, which `add` accepts.
- **Executable unit** (`lib/executable-unit.ts`): floor files, hooks and product commands are written all-or-nothing.
  One skip holds the rest (`held`), so the floor never mixes two versions.
- **Deletes**: only the directory of a capability dropped from the config, because PHARN enumerates capabilities from
  disk. Nothing else is deleted.
- **Orphans** (`lib/orphans.ts`): a record key outside the new manifest that is still on disk is listed and keeps its
  record. It is never deleted.
- **Every run plans**: there is no same-version shortcut. `update` downloads and plans at the recorded version too, so
  a missing file, a pending root migration or ignore-file line, an old `models` block, a channel switch or a frozen
  capability is handled by the one planner. "Up to date" is a plan that changes nothing (`changesNothing`); only the
  ahead-of-source guard returns before the download.

## Root footprint

- The lock is `pharn/.lock` and backups go to `pharn/.backup/<ts>/` in every layout.
- `lib/root-migration.ts` retires the root copies of `THREAT-MODEL.md`/`LIMITS.md` once the clone ships them under
  `pharn/`, deleting a root copy only when it is record-equal and its `pharn/` copy landed.
- User data at the root (`memory-bank/`, `pharn.spec-template.md`) is never moved, copied or deleted. The note only
  hints at the `git mv`.

## Ignore files

- `lib/gitignore.ts` appends `pharn/.run/` and `pharn/.backup/` to `.gitignore`. It is append-only, and the old bytes
  are always the prefix.
- `lib/prettierignore.ts` appends the install surfaces to `.prettierignore`, only when the project uses Prettier. The
  entries are derived from the paths pharn writes.
- Both share `lib/ignore-file.ts`, and both report a refusal or a failed write instead of throwing.

## The `models` block

The block is pharn-oss's: its schema and defaults live in pharn-oss's checker. `/pharn-ship` and `/pharn-loop` read
`models.stages` to pick the model requested for routed stage agents. A direct `/pharn-<stage>` uses the command's own
frontmatter.

- `lib/model-config.ts` is a pinned copy of the checker's rules. The CLI never runs a file it installs, and
  `tests/model-config-parity.test.ts` holds the copy to the vendored checker.
- `lib/models-update.ts` decides the block's outcome with the same per-file rows, hashed under the non-path record key
  `pharn.config.json#/models`. A kept block is never rewritten: the CLI keeps no format of its own.

## `status` (`commands/status.ts`)

Strictly read-only.

- **Version**: the installed `skillsVersion` against the channel's.
- **Drift** (`lib/diff.ts`): the expected file set against the project. It is a report, not a preview, because it does
  not read the records; only `update` can tell an upgrade from a skip.
- **Hooks** (`lib/hook-wiring.ts`): upstream's hook entries against the project's `settings.json` ∪
  `settings.local.json`.
- A recorded layout that differs from the clone's prints a `LAYOUT` note instead of drift.
- `--no-drift` skips the clone. `--strict` exits 1 on an outdated, modified, missing, unreadable or
  not-shipped-upstream finding, a layout mismatch, or an unwired hook. Orphans and the `MODELS` and `PRETTIER` notes
  are advisory.
- `--json` prints one object (`schemaVersion: 1`) through `serializeStatusReport`.
