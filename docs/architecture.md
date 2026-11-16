# Architecture

How the `pharn` CLI is put together, command by command. This is the maintainer's map. The user-facing behaviour of
each command is in [`commands/`](commands/), and the security-sensitive modules are listed in
[`contributing.md`](contributing.md#security-sensitive-files). The root `ARCHITECTURE.md` is PHARN's own spec, a
different document. Each module's header comment explains its own "why"; this page only connects the modules.

## Dispatch and options

`src/index.ts` parses argv with minimist and dispatches to `commands/{init,add,remove,update,list,status,uninstall}.ts`.
`init` is the default command, and `rm` is an alias of `remove`.

- **`ALLOWED_FLAGS`** is the per-command flag table. It is a `Map`, because `cmd` is untrusted argv and an object lookup
  would resolve `Object.prototype` keys. An absent row means "no check", so `pharn bogus --json` still says
  "Unknown command". The global minimist `boolean:` list is computed from this table, so a flag no command takes
  cannot be declared at all.
- Offenders come from a second minimist parse under that command's declarations alone, keeping only its `unknown`
  verdicts. They are never read from `Object.keys(argv)`, which cannot tell a passed flag from a defaulted one.
- **`REQUIRED_WITH`** says which flags cannot be passed alone. For `update`, `--json` needs `--dry-run` and `--compact`
  needs `--json`. For `init`, `--json` needs `--dry-run`, so a bare `pharn --json` is refused.
- Both refusals print one stderr line plus a pointer at `pharn --help`, and exit 1. They sit above the `--help`/`--version`
  short-circuits, so `--help` licenses no bad sibling flag. The positional-arity check (`MAX_POSITIONALS`) sits below them.
- `--ref` (`latest` | `main`) and `--archetype` (an exact comma-separated list of archetypes) are the only flags that take
  values. A bare, negated, repeated or unknown value is refused.
- `pharn <cmd> --help` prints only that command's options, rendered from the same help data as the full `USAGE`.

**TTY gate.** `init`, `update`, `uninstall` and the bare `add`/`remove` pickers read `process.std*.isTTY` into the
shared `interactiveAllowed` predicate and exit 1 off a TTY, so a dead stream never answers a prompt. In `init` and
`update` the gate sits after the local promptless step (the git prerequisite, the config load) and before any network
call.

- `update --yes` skips the confirm and nothing else.
- `init --yes` skips only the summary confirm. It installs only when none of its write targets exists
  (`assertNoExistingTargets`). An existing `pharn.config.json` is refused before the fetch (`existingConfigRefusal`).
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
   and extracts the codeload tarball into a temp dir that is removed in a `finally`. Every exit happens after that.
4. **Index and selection.** `parseCapabilityIndex` reads each capability's `role`/`applies` frontmatter by pharn-oss's
   own rules. `resolveCapabilities` selects `universal` capabilities and those whose `applies` intersects the archetypes.
5. **Carry-over** (`lib/init-plan.ts`). The replaced config is read tolerantly. A config that exists but cannot be read
   is named in the summary, and nothing is carried. Otherwise `carryOver` applies `update`'s merge rules:
   - a `manual` entry the index still has is reinstalled as `manual`;
   - an entry upstream ships but this CLI cannot parse is kept verbatim and listed in `frozenCapabilities`;
   - a manual entry upstream dropped is dropped and named;
   - user-owned top-level keys (everything outside `CLI_OWNED_KEYS`, `seam` included) are copied across.
6. **Summary, pre-flight, prompt.** The summary prints the archetypes and where they came from. The install manifest is
   computed once and shared by the pre-flight, the prompt and the copy. `preflightInstall` refuses an unfinishable
   project before the overwrite prompt. `confirmWriteTargets` lists existing targets (default No). On a re-install it
   marks exactly the files `update` would skip: `(edited)`, `(no pharn record)`, `(differs from upstream)`. Dropped
   capabilities are listed under "will be DELETED".
7. **Install** (`steps/install-archetype.ts`). Under the lock it re-checks the config fingerprint, re-runs the
   pre-flight and the drift scan, then makes one `createBackup` (drift, the replaced config, and removed capabilities'
   files). Then it deletes, copies, and writes records, config, `.gitignore` and `.prettierignore` lines.

`--archetype <list>` replaces detection. Detection still runs and is shown as "(not used)", and the override is
recorded as `config.archetypes`, which `update` keeps. A re-run without the flag whose detection differs prints the
previously recorded archetypes.

**`init --dry-run [--json]`** runs steps 1–5 and `buildInitPlan`. That is read-only, and `planWriteTargets` is the same
target and label computation the prompt uses. It skips the TTY gate, both prompts, the lock and every write function.
`--json` prints one object (`lib/init-report.ts`, `INIT_SCHEMA_VERSION = 1`).

## The copy (`lib/install-capabilities.ts`)

- `installCapabilityDirs` (used by `add`) pre-flights every selected source before any write, then copies each
  griller/lens dir.
- `installCapabilities` (used by `init`) also copies the fixed surfaces: product `pharn-*` commands and agents (never
  `pharn-dev-*`), `.cjs`/`.mjs` hooks (never `*.test.*`), the trusted docs, upstream's `LICENSE` (to a pharn-owned
  name), the product-loop boundary contract, `pharn-contracts/`, `pharn-core`, and `.dev/floor/` minus its tests and
  test fixtures.
- `.claude/settings.json` is never overwritten or merged. When none exists, upstream's is copied and its hash recorded,
  so `uninstall` can remove it unchanged. A `HOOKS` note lists what it wires.
- Every declared surface the clone does not ship is reported (`absentInstallSurfaces`): by `init` as a warning, by
  `update` as `NOT SHIPPED`, and by `status` as drift that fails `--strict`.
- The destination is guarded by `prepareInstall`, which runs before the prompt, again before the backup, and again
  before the copy. It refuses a path through a symlinked directory or file, and a directory where
  `pharn.config.json`/`pharn.records.json` belong. A live `.claude/settings.json` link is allowed, since it is never
  written.

The install mirrors the clone's layout: `pharn` (everything under `pharn/`) or legacy `flat` (`lib/layout.ts`).

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
  install if a destination path crosses a symlinked component, because `cpSync` writes through a symlinked intermediate
  directory.
- Records are merged keyed by the clone's file list, never a walk of the destination.

## `remove` (`commands/remove.ts`)

The inverse of `add`, with no clone and no network.

- It deletes one capability dir at the recorded layout (a strict child of its role subtree, via `safeChildJoin`) and
  drops its config entry.
- It refuses a target whose path crosses a symlink, both before and again inside the lock.
- Before deleting, it backs up every file it cannot prove is pharn's (`removalBackupSet`: unrecorded, edited, or all of
  them when the store is unusable).
- It prunes that capability's keys from `pharn.records.json` by key prefix. The trailing `/` is load-bearing.
- Removing an entry whose `source` is `'auto'` warns that `update` may reinstall it.

## `uninstall` (`commands/uninstall.ts`)

Offline. Without a usable records store it refuses.

- `planUninstall` puts every record key in one bucket: `outside` (not an install path), `unsafe` (a symlinked parent,
  which refuses the run), `absent`, `unverifiable`, `edited` (kept), or `delete` (hash equals the record).
- Flow: plan note, confirm, then under the lock it re-plans, backs up the config, unlinks the `delete` bucket, removes
  dirs left empty, and unlinks the records and then the config last.
- A `HOOKS` note names settings entries that point at hooks the run removed.

## `update` (`commands/update.ts`)

**Plan, then write.** `buildUpdatePlan` (`lib/update-plan.ts`) is the read-only planner: index, merge, manifest,
per-file decisions, models, removals, orphans, hook wiring. It returns a JSON-safe `report` and an `apply` half.
`applyPlannedUpdate` writes in this order: backup, removals, writes, records, config. `--dry-run` rides the planner
alone and reaches no write function. `--dry-run --json` projects the report through `lib/update-report.ts`
(`schemaVersion: 1`).

**The real run plans before it asks.** It downloads once, plans, prints the membership changes, and asks. A plan that
changes nothing (`changesNothing`) asks nothing and writes nothing. Then, under the lock: `assertConfigUnchanged`, a
re-plan from the same clone, and a refusal if the membership changed since the prompt.

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
- **Same-version early return**: at the recorded version `update` returns early unless something local reopens it: a
  missing installed path, a missing agent, a pending root migration, a pending ignore-file line, a `models` block in the
  old format, or frozen capabilities. Each signal is bounded: the run it opens closes it.

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
- `lib/models-update.ts` migrates the CLI's own pre-0.7.0 format. It decides the block's outcome with the same per-file
  rows, hashed under the non-path record key `pharn.config.json#/models`.

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
