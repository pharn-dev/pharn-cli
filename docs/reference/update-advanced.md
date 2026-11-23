# update: less common situations

The states and notes of [`pharn update`](../commands/update.md) that most runs never meet. Each section
is linked from the command page.

## The executable unit is upgraded all or none

Some installed files run together: the floor checkers (`pharn/floor/`, every file `pharn` installs there,
including the `.json` maps the checkers read), the hooks (`.claude/hooks/*.cjs` / `*.mjs`) and the product
commands (`.claude/commands/pharn-*.md`, which call the floor checkers by name and flag). Upgrading part of
that set leaves two versions side by side, and a new checker that imports something an old, edited sibling
does not export fails as soon as it loads.

So when a run **moves you to a new skills version** without `--force` and **any** file of that set would be
skipped (`modified`, `unrecorded`, `unverifiable` or `unreadable`), `update` writes **none** of the set's
other files either. Those are reported as **`held`**. Everything outside the set (capability directories,
the trusted docs, contracts, `pharn-core`, the license and the features README) is still decided file by
file.

Membership is decided by **path only**: `pharn` does not read a file or follow its imports. Before the
question, and again after the run, an `EXECUTABLE UNIT` note names the files that blocked the set and says
how many were held:

```text
◇  EXECUTABLE UNIT
│    The floor, the hooks and the pharn-* commands run together, so pharn
│    writes them all or none. These unit files were skipped:
│    modified     pharn/floor/reconcile-baseline.mjs
│
│    So 3 other unit file(s) were not written either, and the
│    unit stays at the version you had: upgrading part of it would mix two
│    versions that may not load together.
│
│    To upgrade the unit: revert the skipped files, or run
│    `pharn update --force` (it backs them up to pharn/.backup/ first).
```

What follows from a hold:

- The recorded `skillsVersion` is **withheld**, as for any skip.
- When every file that blocked the unit (and every other skipped file) is one **you edited** (`modified` or
  `unrecorded`), the version the run applied is recorded as `pendingSkillsVersion`, and
  [`pharn add`](../commands/add.md) installs at it: it writes capability directories only, which are outside
  the unit and were upgraded anyway. When any blocker is something else (`unverifiable` because there is no
  usable record store, or `unreadable`), nothing is recorded, and `pharn add` refuses until the update can
  finish. `pharn update --dry-run` shows what blocks it.
- A unit file that is **missing** is not put back while the unit is held. The note names such files under
  "Of those, these are not on disk, so they stay missing until the hold ends". For a hook you deleted, that
  means: `pharn` never touches `.claude/settings.json`, so the hook entry stays wired to a script that is not
  on disk, and that guard does not run until the hold ends. [`pharn status`](../commands/status.md) reports
  the file as missing in the meantime.
- A held file keeps its old record, and a file new upstream gets none. The next run decides them again.
- The run **exits 0**, like every skip. The note is the signal, not the exit code.
- `--force` never holds. It backs up the skipped files and writes the whole set (an `unreadable` path is
  still skipped).
- At the **same** skills version (a run that restores a missing file, for example) nothing is held:
  restoring a file then puts back bytes of the version you already have.

What `pharn` can promise here is only that it wrote no file of the set. It cannot prove that your edited
files work together, and a file that was already identical to upstream before the run is left as it is.
Editing a `/pharn-*` command, including its `model:` or `effort:` line, also holds the floor and the hooks
until you revert the edit or use `--force`. `--dry-run` prints the same note, and `--dry-run --json` adds
`plan.executableUnit` (see [JSON output](json-output.md#update)).

## Orphaned files

When upstream stops shipping a file `pharn` installed (a `pharn-*` command, a hook, a floor checker, a
trusted doc, or one file inside a capability you still have), `update` leaves it on disk (see
[What PHARN deletes](deletes.md)). Such a file is an **orphan**: `pharn.records.json` says `pharn` wrote it,
it is no longer part of your install, and it is still there. A leftover `.claude/commands/pharn-*.md` is
still a live slash command, and a leftover hook or checker still runs if anything calls it, so `update`
names every orphan in an `ORPHANED` note:

```text
  Upstream no longer ships these files pharn installed. `pharn update` never
  deletes them, and keeps listing each one until it is gone.

  UNCHANGED — unchanged since pharn wrote it
  .claude/commands/pharn-old.md

  EDITED — changed since pharn wrote it — review before deleting
  .dev/floor/check-old.mjs

  Delete the ones you no longer need by hand (e.g. `git rm <path>`).
```

- **`UNCHANGED`**: the file still has the exact bytes `pharn` recorded writing.
- **`EDITED`**: it changed since then. The change is yours, so look before deleting.
- **`UNREADABLE`**: something other than a readable regular file sits there (a directory, a symlink, an
  unreadable file), named with the reason. `pharn` does not read through it.

Each group shows at most 20 paths, then `… and N more`; `pharn status --json` lists them all. An orphan is
never a skip: it does not withhold the version bump and does not appear in `SKIPPED`. This includes a root
`THREAT-MODEL.md` or `LIMITS.md` that an install from a pharn-oss older than 7.0.0 left and `pharn` recorded,
and the top-level copies of a former `flat` install; delete them by hand, or let
[`pharn uninstall`](../commands/uninstall.md) remove them while they still equal their record. A root
`memory-bank/`, `pharn.spec-template.md` or `.pharn/` is never moved, copied, deleted or mentioned; what to
do with them yourself is in [Getting started](../getting-started.md#what-you-get).

**It stays listed until you delete it.** `update` keeps the orphan's entry in `pharn.records.json` (its old
hash) for as long as the file exists, so every later `update`, and every
[`pharn status`](../commands/status.md#orphaned-files), still names it. Once the file is gone, the next
`update` drops its entry, at the same skills version too, and the run after that is up to date again. If
upstream ships the path again later, the kept entry makes it a clean `updated` instead of an `unrecorded`
skip. A re-run `pharn init` keeps those entries too.

What is **not** listed:

- Files `pharn` has no record of. With no usable store, nothing is listed.
- The files of a capability this update **drops** from your config: that is a membership change, named in
  the `CAPABILITIES` note, and its directory is deleted (see
  [Dropped capabilities are deleted](../commands/update.md#dropped-capabilities-are-deleted)).
- Anything outside the paths an install can write (`.claude/commands/pharn-*.md`, `.claude/hooks/*.cjs` or
  `*.mjs`, the capability directories, `pharn-contracts/`, `pharn-core/`, the floor directory, the trusted
  docs, the PHARN license and the features `README.md`), even if a hand-edited `pharn.records.json` names it.

Every run plans, so an up-to-date run prints the `ORPHANED` note too. `--dry-run --json` lists orphans in
`plan.orphans` when its `status` is `planned`; an `up-to-date` report has `plan: null`, so use
`pharn status --json` (`orphans`) to list them then.

## When pharn cannot read a capability upstream

A capability can change upstream in a way your installed `pharn` does not understand yet: a new field value,
a directory that does not have its markdown yet, a shape from a newer release. `update` then **skips that one
capability and says so**; it does not abort:

```text
1 upstream capability could not be read and was SKIPPED — not installed:
  griller:backwards-compat (pharn/pharn-pipeline/grillers) — missing its markdown backwards-compat/backwards-compat.md.
```

- **Nothing under that capability's directory is written.** `pharn` will not copy content it could not
  validate.
- **Your `pharn.config.json` entry is kept**, reported as `KEPT — pharn could not read these upstream this
run`.
- **Everything else updates normally**, including the skills version, so the next
  [`pharn add`](../commands/add.md) is not blocked.

`pharn` records the kept capability in `frozenCapabilities` in `pharn.config.json`. Every run downloads and
re-checks it, so the message repeats while the situation lasts. Once the capability can be read (upstream
finishes the change, or you upgrade with `npm install -g @pharn-dev/pharn@latest`), `update` brings its files
up to date and clears the field, but only once none of its files had to be skipped: a file of it you edited
is skipped as usual, and the capability stays listed until you resolve the edit or pass `--force`. If you no
longer want it, use [`pharn remove`](../commands/remove.md).

## The `models` block

`models` in `pharn.config.json` is **pharn-oss's** block: the source of truth each `/pharn-*` command's
`model:` / `effort:` frontmatter is held to, which `/pharn-ship` and `/pharn-loop` read to pick the model
they request for the stages they route (see [pharn.config.json](pharn-config.md#models)). `update` decides
it with the decision table, using the block's hash where a file would use its bytes, and prints a `MODELS`
note for every outcome except "already identical":

| Your block                                                                | Default                   | With `--force`                               |
| ------------------------------------------------------------------------- | ------------------------- | -------------------------------------------- |
| absent                                                                    | pharn-oss's is written    | same                                         |
| identical to pharn-oss's                                                  | nothing to do             | same                                         |
| still what `pharn` wrote — its recorded hash                              | replaced with pharn-oss's | same                                         |
| changed since `pharn` wrote it, never recorded, or no usable records file | **kept**                  | `pharn.config.json` backed up, then replaced |

"What `pharn` wrote" is compared as `pharn` writes it: re-indenting the file is not an edit, but reordering
the block's keys is, so a reordered default counts as yours and is kept. The block's record lives in
[`pharn.records.json`](pharn-records.md#the-models-block).

**A kept block pharn-oss's rules reject** (one you edited into an invalid shape, or one in the format
`pharn` wrote before 0.7.0: a top-level `default`, and model ids such as `opus-4-8`) stays exactly as it is,
and the `MODELS` note lists what the rules reject in it. To replace it, edit the block by hand, or delete the
`models` key so the next `pharn update` writes pharn-oss's (the "absent" row). `--force` replaces it too,
after backing up `pharn.config.json`, but also overwrites every other file you edited. An old-format block is
replaced without asking only when its recorded hash proves `pharn` wrote it; `pharn` does not convert it.

A kept block never holds back the skills version, unlike a skipped file: a block you tuned is a steady
state, not an unfinished upgrade. If your values differ from the installed commands' frontmatter,
`node pharn/floor/check-model-config.mjs agreement` lists where (nothing runs it automatically). Editing the
frontmatter of a `/pharn-*` command is a different edit: that file becomes `modified`, so `update` skips it
and **does** withhold the skills-version bump. Editing only the block causes no file drift, and a re-run
`pharn init` resets it (copying the previous `pharn.config.json` to `pharn/.backup/` first).

If pharn-oss ships no block, yours is left alone, and what its rules reject in it is listed. If pharn-oss
ships one this `pharn` cannot accept (pharn-oss's rules can move ahead of the copy of them in your `pharn`),
the block is not applied, the reasons are listed, and upgrading `pharn` fixes it.

## Missing files at the same skills version

When your `skillsVersion` already equals upstream's, `update` still downloads and plans, so a missing file
is restored like on any other run: a capability directory or a recorded file that is gone, or a surface a
newer `pharn` release installs that your install never had (`pharn/pharn-core/`, say). Until then
[`pharn status`](../commands/status.md) reports such files as `missing` and `pharn status --strict` exits 1.
The decision table always restores a missing file, so your edits elsewhere are kept and no `--force` is
needed. `--dry-run` shows it under `WOULD WRITE — restored`, and `--dry-run --json` reports `status`
`planned`. The next `update` answers `Up to date.`

The review lens agent, `.claude/agents/pharn-review-lens.md` (shipped by pharn-oss from skills version 6.64.0
on; `/pharn-review` runs each lens in it, and without it each lens runs as a general-purpose agent with more
tools), is restored the same way, recorded, and kept as `modified` once you edit it. A `.claude/agents` that
is a symbolic link is never written through.

A path that goes through a symbolic link is never followed and is not restored, and neither is a path
blocked by a file where a directory should be: the run skips it (`Nothing to change.` when that is all it
finds), and [`pharn status`](../commands/status.md) reports it. A capability you removed with
[`pharn remove`](../commands/remove.md) is restored too when your archetypes still select it (see
[Removing an auto-selected capability](../commands/remove.md#removing-an-auto-selected-capability)).

## A records store from an interrupted run

[`pharn.records.json`](pharn-records.md) records the `skillsVersion` and `commit` of the `pharn.config.json`
it was written with. `pharn add` and `pharn update` write the store first and the config second, so a run
interrupted between the two (a crash, a full disk, Ctrl-C) leaves a store stamped for a state the config
never reached.

`update` uses such a store as it is: a file whose current hash equals its recorded hash holds bytes `pharn`
wrote, whatever version the store was written for. At the same skills version the run rewrites the store
with the config's stamp and changes nothing else, and on the next upstream release every file you did not
edit upgrades, every file you edited is skipped as `modified`, and no `--force` is needed. The two edge cases
of trusting the hash alone are in [The stamp is not a gate](pharn-records.md#the-stamp-is-not-a-gate).

An `update` interrupted while it was copying files (after some or all of them landed, before the store
was rewritten) is covered too. Before its first copy it writes the hashes of the files it is about to
write into the store's [`incoming`](pharn-records.md#shape) map, so a plain `pharn update` treats a file
whose bytes equal that hash as written by `pharn`: it finishes the update, even when upstream has released
again in between, with no `modified` and no `--force`. A file you edit after the interruption is still
skipped as `modified`. Three cases fall back to the behaviour above (the changed files read as
`modified` until `--force`): a `pharn add`, `pharn remove` or `pharn init` run before the re-run (each
rewrites the store without `incoming`), a re-run by `pharn` 0.21.2 or older, and a run interrupted after
the store was rewritten but before the config was, when the same release changed the `models` block
(the block then reads as edited and is kept).

## No usable records store

A store that is **absent** or **unreadable** (invalid JSON, an unknown `schemaVersion`) is not used: every
present file that differs from upstream is skipped as `unverifiable`, and the run names the reason. `pharn`
cannot tell your edits from upstream's changes, and will not guess. Missing files are still restored, and
every file that matches upstream is recorded again, so a plain `update` writes a new store over the
unreadable one (copy it aside first if you want to repair it by hand). Resolve the rest once, either way:

- `pharn update --force`: overwrite them, keeping a backup of the current bytes; or
- inspect the listed files first (`pharn status` shows the same set), revert what you did not intend to keep,
  and re-run `pharn update`.

Either path writes a full record store. The record of a `.claude/settings.json` that `init` created cannot
be rebuilt this way: `update` never writes that file.

## An install recorded at the flat layout

The legacy `flat` layout (PHARN's files at the project root: `"layout": "flat"` in `pharn.config.json`, or no
`layout` key) is no longer supported ([support policy](../support-policy.md#the-flat-layout-is-removed)).
`update` (and `--dry-run`, `--json`) exits 1 on such a config before it downloads anything, with one message:
re-run `pharn init`. `init` reinstalls at the `pharn/` layout and keeps the capabilities you added with
`pharn add` ([init](../commands/init.md)). It never moves or deletes the old top-level copies: the ones
`pharn` recorded stay listed under [`ORPHANED`](#orphaned-files) until you delete them. A fetched pharn-oss in
the flat layout ships no `pharn-install.json`, so the fetch refuses it and nothing is written.

## A surface pharn-oss does not ship

Every product surface `update` installs is optional on the way in, as for
[`init`](../commands/init.md#a-surface-pharn-oss-does-not-ship): a fetched tree that ships nothing for one
(the commands, the hooks, a trusted doc, pharn's `LICENSE` copy, `features/README.md`, or the contracts,
`pharn-core` or floor dir) is still applied. A run that plans (the real one and `--dry-run` alike) names
each such surface in a `NOT SHIPPED` note, by path and kind, with the same wording as `init`. It is
reported, never a skip, so it does **not** withhold the `skillsVersion` bump. Every run plans, so an
up-to-date run names it too; [`pharn status`](../commands/status.md) names it on every run and fails
`--strict` while it lasts. Hooks are installed as `.cjs` or `.mjs` files (never `*.test.cjs` /
`*.test.mjs`); an `.mjs` hook's name is held to the same filename allowlist as a `.cjs` one, so a name
outside it refuses the run.

## The features README at the project root

When your install recorded a root `features/README.md` (the product-loop boundary contract) and the fetched
pharn-oss ships it at `pharn/features/README.md`, `update` installs the new copy and says the root copy is
left behind and no longer managed by `pharn` (the dry run says it _would_ be). Delete the root copy by hand
once nothing you keep refers to it. `--dry-run --json` reports this as `plan.featuresReadmeRelocation`.

## `.gitignore`

Like [`init`](../commands/init.md#gitignore), every applied `update` makes sure your root `.gitignore` covers
`pharn/.run/` (PHARN's runtime scratch) and `pharn/.backup/` (`pharn`'s backups), appending only the missing
lines: created if absent, your bytes kept exactly, CRLF kept, equivalent spellings and your own negations
respected, never written through a symlink. It runs after the config write, under the lock, and prints
`Added … to .gitignore` (or `Created .gitignore with …`); a refusal or a failed write is a warning naming the
lines, never a failed update.

At the same skills version too, a `.gitignore` missing either line makes the plan add it, and the following
run is up to date. A `.gitignore` `pharn` cannot write (a symlink, a directory, unreadable) is a warning, and
the run is otherwise up to date. One residual: a regular file whose write keeps failing (no permission) asks
and fails to write on every run, each with its warning. `--dry-run` prints `.gitignore: would add …`, and
`--dry-run --json` carries `plan.gitignore`.

## `.prettierignore`

In a project that uses Prettier, every applied `update` makes sure the root `.prettierignore` covers the
files it records writing, the same way [`init` does](../commands/init.md#prettierignore): the same
detection, the same derived lines (including `/pharn/features/`, `/pharn.config.json` and
`/pharn.records.json`), the same append-only rules. It runs after `.gitignore`, under the lock, and prints
`Added N paths to .prettierignore …` (or `Created .prettierignore with …`); a refusal or a failed write is a
warning listing the lines, never a failed update.

At the same skills version too, a `.prettierignore` that does not cover the files the run records makes the
plan add the lines (for a project that adopted Prettier later, say), and the following run is up to date. A
file `pharn` cannot write is a warning; a write that keeps failing asks and fails on every run. If you
already ran `prettier --write` over pharn's files, they now read as changed: add the lines (or let `update`
add them), then `pharn update --force` puts pharn-oss's bytes back, backing your copies up first.
`--dry-run` prints `.prettierignore: would add …`, and `--dry-run --json` carries `plan.prettierignore`.

## What is protected by default

- **`.claude/settings.json`**, your Claude Code configuration. `init` writes it only when absent; `update`
  **never** touches it (not even with `--force`: it is not in the install manifest). When `init` created it,
  `update` keeps the hash `init` recorded for it in `pharn.records.json` while the file exists, so
  [`uninstall`](../commands/uninstall.md) can still remove it unchanged; a deleted file is not put back, and
  the next `update` drops its record, re-applying once even on an already-current install (it copies no
  file); the run after it changes nothing.
- **The `HOOKS` note.** `update` compares the hooks of `.claude/settings.json` and
  `.claude/settings.local.json` with the fetched upstream ones, and names every hook upstream wires that
  neither file does. Matching is textual, so an equivalent hook you wrote differently is listed too. Each
  line is the hook as JSON. A hook whose script you already wire in another spelling (same event and matcher)
  is listed under `REPLACE`, with your current line, so you swap it rather than add a second one; the rest are
  listed under `ADD`. The note also names hooks wired only in `settings.local.json`, which run for you but not
  for your teammates. See [status](../commands/status.md#what-is-intentionally-excluded) for the full rules.
- **`pharn/CONSTITUTION.md`** is protected like every other manifest path: if you have edited it, it is a
  `modified` skip by default. `--force` overwrites it too, after copying the current bytes to
  `pharn/.backup/`.

## Writes replace the file

`update` writes the new contents to a temporary file beside the destination and renames it into place, so it
never writes into the existing file. A hard link (a second name for the same file, which looks like an
ordinary file) therefore keeps its other name's contents: only the name inside your project gets the new
bytes. The file keeps upstream's permissions, and an installed file you made read-only is replaced like any
other: what `update` needs is write permission on its folder.
