# pharn update

Re-fetch the capabilities installed in your project at the latest skills version — **without
destroying anything you have edited**.

```bash
pharn update
pharn update --force   # overwrite your edits too (each file is backed up first)
pharn update --yes     # skip the confirmation prompt (for CI and scripts)
pharn update --dry-run # show exactly what it would do, and write nothing
pharn update --dry-run --json # ...as one JSON object, for scripts and agents
pharn update --dry-run --json --compact # ...without the list of unchanged files
pharn update --ref latest   # follow verified releases instead of main (recorded)
pharn update --ref main     # back to the tip of main (recorded)
```

`--force`, `--yes`/`-y`, `--ref`, `--dry-run`, `--json` and `--compact` are `update`'s **only** options,
and they compose. Two imply others: `--json` implies `--dry-run`, so `pharn update --json` is
`pharn update --dry-run --json`, and `--compact` implies `--json` (and so `--dry-run`), so
`pharn update --compact` is `pharn update --dry-run --json --compact`. Any other option — `--strict`,
`--no-drift` — is refused with ``Unsupported option for `update` `` on stderr and exit **1**, as is an
extra positional. So is a value on an on/off option (`--json=false`: `Option takes no value`), a negated
option (`--no-dry-run`: `Unknown option`) and a second `--ref` (`Repeated option`). See
[Unsupported option for this command](../troubleshooting.md#unsupported-option-for-this-command).

`update` compares every PHARN-owned file against the per-file hashes recorded when it was installed
([`pharn.records.json`](../reference/pharn-records.md)). A file whose bytes are exactly what `pharn`
wrote is upgraded. A file it cannot prove is untouched is **skipped and listed**, never overwritten.

## Behavior

1. Checks the Node version before anything else: PHARN's installed floor checkers refuse to run below
   **Node 24.2.0**, so on an older Node (or one whose version cannot be read) `update` exits 1, naming the
   required and the current version, with nothing written — `--yes` and `--force` do not skip it.
2. Takes the project lock (`pharn/.lock`) — before it reads anything or touches the network — and
   holds it to the end of the run, across the confirm. While it waits for your answer, a second
   `pharn` command in this project is refused, naming this one (see
   [Another pharn process is running](../troubleshooting.md#another-pharn-process-is-running)).
   `--dry-run` takes no lock. Then reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config, or one
   recorded at the removed `flat` layout (see [Layout migrations](#layout-migrations)) — it exits with
   a hint to run `pharn init`. A config that is present but **invalid** gets its own named error
   and exit 1, not the "run `pharn init`" hint.
3. Warns if a proxy is configured — emitted once at the top of the run, so it precedes **both** of
   update's fetches (the lightweight version check as well as the tarball).
4. Resolves what to update to — the newest **verified release** for an install that follows releases,
   or the tip of `pharn-dev/pharn-oss` `main` for one that records no `ref` (see
   [Release channel](#release-channel)) — and
   compares its version to your recorded `skillsVersion`. A release that cannot be resolved stops the run
   (exit 1). An install **ahead** of that source — newer than the newest release, or newer than `main`
   when `main` has moved back to an older version — is left as it is (exit 0) unless you pass `--force`
   (see [An install ahead of its source](#an-install-ahead-of-its-source)).
5. Downloads the repo (SHA-pinned) and plans the update — **every run does, at the same skills version
   too**: there is no "same version, nothing to do" shortcut, so one plain `pharn update` restores a
   missing file, adds a missing `.gitignore` or `.prettierignore` line, restores a deleted `models` block,
   records a `--ref` switch and re-checks a capability it kept unread. The plan checks `MIN_CLI`,
   **re-resolves your recorded `archetypes`** against the latest capability index and **unions** that
   result with the capabilities you added by hand. A failed download, a `MIN_CLI` refusal, or a dropped
   capability whose directory cannot be deleted safely stops the run here (exit 1), before you are
   asked anything.
6. If the plan **changes nothing** — no file to write, no directory or root doc to delete, no line to add
   to `.gitignore` / `.prettierignore`, and `pharn.records.json` and `pharn.config.json` would stay as
   they are — the install is up to date: it prints its notes (a kept edit is still listed under
   `SKIPPED`), asks nothing, writes nothing, exits 0, and ends with `Up to date.` (or `Nothing to change.`
   when it keeps an edit of yours; see [When there is nothing to change](#when-there-is-nothing-to-change)).
7. Otherwise shows the version bump (or `(re-applying)` at the same version) with a pointer to
   `CHANGELOG.md`, lists, in a `CAPABILITIES` note, every capability the update would **add** or
   **drop**, with the directory each drop would delete, and under `--force` every file it would
   overwrite (see [Before you confirm](#before-you-confirm)), and asks for
   confirmation — unless you passed `--yes`, which skips that one prompt and nothing else.
8. On confirm, applies the plan you were shown — it plans once. A file you edit while `update` waits for
   your answer stops the run before anything is written (exit 1, with or without `--force`): the
   error names the file, your edit is kept, and re-running `pharn update` plans it as yours and skips
   it (see [Edits made while update waits for your answer](#edits-made-while-update-waits-for-your-answer)).
   So does a hand-edit of `pharn.config.json`. Otherwise it writes what the plan decided for each
   expected file with the table below — and your `models` block the same way — backs up
   anything `--force` is about to overwrite and every file in a dropped capability's directory that
   `pharn` cannot prove it wrote (read again at the delete, so a file you add there meanwhile is saved
   too), **deletes the directories of the capabilities it drops** (see
   [Dropped capabilities are deleted](#dropped-capabilities-are-deleted)), copies the files it may
   write, then updates `pharn.records.json` and `pharn.config.json` — recording this CLI in
   `pharnVersion` and the time of the update in `updatedAt`, and keeping `installedAt`, the date of
   the first install.

Because `update` re-resolves your archetypes against the latest index, a capability upstream added for
one of your archetypes since your last install is picked up, and one it removed is dropped — and its
directory deleted — while your `archetypes` list itself is never changed.

### Edits made while update waits for your answer

`update` holds the project lock from before its plan to its last write, so no other `pharn` command
changes the project while the confirm is open. You, an editor or an agent still can. Before the first
write, `update` compares every file it is about to write with what it saw when it planned:

- a file whose bytes changed (or that appeared) stops the run, with nothing written:

  ```text
  ■  A file changed while `pharn update` was waiting for your answer:
       pharn/CONSTITUTION.md
     Nothing was written, and your edit is kept. Run `pharn update` again: it plans the file as
     changed by you and leaves it alone (or, with --force, backs it up first).
  ```

- a file you put back with exactly upstream's bytes is not an edit, and the run goes on;
- a hand-edit of `pharn.config.json` stops the run the same way.

The run stops instead of skipping the file because the rest of the plan — the version it records, the
[executable unit](#the-executable-unit-is-upgraded-all-or-none) — was decided
from the bytes you have since changed. The re-run decides them again.

## Previewing an update

```bash
pharn update --dry-run          # what would a plain update do?
pharn update --dry-run --force  # ...and what would --force overwrite and back up?
pharn update --dry-run --ref latest
```

`--dry-run` runs the same checks and the same per-file decisions as a real update, prints the result,
and exits **0** having **written nothing**: no file in your project, no `pharn.records.json` or
`pharn.config.json` change, no `pharn/.lock`, no `pharn/.backup/`. It needs no terminal and never
asks to confirm (`--yes` is accepted and does nothing). Use it to look before you apply — in a
terminal, or from a script or an agent that wants to read the plan first.

What it still does, exactly like a real run: the Node check, the config load, resolving the source
(`--ref`), the "ahead of the release" and "ahead of main" early returns (reported, exit 0, nothing
downloaded), the clone — which a dry run at the current version downloads too — and the `MIN_CLI` gate
(a refusal exits 1). What it skips: the confirm, the project lock and
the check that the config did not change under you.

It prints:

- `PLAN` — the files it would **write** (`restored`, `updated`), under `--force` the ones it would
  **overwrite** (`modified`, `unrecorded`, `unverifiable`), the capability directories it would
  **delete** (`WOULD DELETE`), the files it would **back up** first
  (`pharn/.backup/<timestamp>/` — the timestamp is only known when a real run makes the backup), how
  many are unchanged or skipped, and the channel it would record when `--ref` changes it;
- `Nothing would be written.` when a real run would [change nothing](#when-there-is-nothing-to-change)
  (it would then ask nothing either), or `Would rewrite only pharn.config.json` (or
  `pharn.records.json`, or both) when those are all it would change; under `--force` the
  `WOULD OVERWRITE (--force)` groups also name `pharn.config.json` when your `models` block would be
  replaced;
- the `SKIPPED`, `CAPABILITIES`, `MODELS`, `HOOKS` and `NOT SHIPPED` notes of a real run, worded as
  what _would_ happen;
- whether the recorded `skillsVersion` would be **withheld** (and recorded as pending), and the layout
  and features-README moves it would make.

It is a **snapshot**, not a promise. A real run fetches again and plans again under its own lock,
so an edit you make, another process, or a newer upstream merge between the preview and the apply can
change the outcome. The only thing a dry run creates is the clone's temporary directory under your OS
temp directory, removed before it exits.

### JSON output

`pharn update --dry-run --json` (also `pharn update --json`) prints the same plan as **one JSON object**
on stdout and nothing else, and exits 0 whatever it contains; the outcome is its `status` (`planned`,
`up-to-date`, `ahead-of-release`, `ahead-of-main`), and `--compact` leaves out the unchanged files. Its
keys, the `schemaVersion` 1 stability rule and a real example are in the
[JSON output reference](../reference/json-output.md#update).

## What happens to your capability list

`update` does **not** replace `capabilities` with the resolved set. It writes the union:

```text
next capabilities = resolve(your archetypes, latest index)   ← the `source: "auto"` set
                  ∪ every `source: "manual"` entry still in the latest index
```

So a capability you installed with [`pharn add`](add.md) **survives an update that does not select it**,
as long as it still exists upstream — a manual entry whose capability has been removed from the index is
dropped instead (named under `REMOVED — no longer exists upstream`). Its files are upgraded, restored, or
skipped-on-edit by the same table below as everything else when it is kept. An entry that is both manual
and re-selected stays `manual`, so a later archetype change cannot quietly drop it. A capability you
removed with [`pharn remove`](remove.md) returns only when the latest resolution still selects it for your
archetypes — then it re-enters as `auto` and is named under `ADDED`. See
[`capabilities[].source`](../reference/pharn-config.md#capabilitiessource--selection-provenance).

**Every membership change is named.** When the list changes, `update` prints a `CAPABILITIES` section:

| Reported as                                               | Meaning                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `ADDED — newly selected for your archetypes`              | New upstream for your archetypes, or re-selected after a remove |
| `REMOVED — no longer selected for your archetypes`        | An `auto` entry your archetypes no longer select                |
| `REMOVED — no longer exists upstream (was a manual add)`  | A `manual` entry whose capability is gone from the index        |
| `KEPT — your manual add, not selected by your archetypes` | A pre-`source` entry preserved as manual (printed once)         |
| `KEPT — pharn could not read these upstream this run`     | A capability this pharn version could not parse (see below)     |

If nothing changed, nothing is printed. A `REMOVED` line also says what happened to that capability's
directory: `directory deleted`, `directory deleted (N file(s) backed up first)`, or `already gone`.

### Dropped capabilities are deleted

PHARN's commands find the grillers and lenses they run by **scanning their directories** — not by
reading `pharn.config.json`. So a capability `update` drops from the config (either `REMOVED` reason
above) would keep running if its directory stayed, and `pharn remove` could no longer reach it, since
`remove` addresses what the config lists. `update` therefore **deletes that directory** in the same run,
inside the project lock, the way [`pharn remove`](remove.md) does:

- **Backed up first.** Every regular file in the directory that is not, provably, `pharn`'s own
  unchanged bytes is copied to `pharn/.backup/<timestamp>/` before the first delete: a file you added,
  a file you edited, and **every** file when there is no usable `pharn.records.json`. A file still at the
  hash `pharn` recorded writing is not copied; `pharn add` can install it again. The backup is named when
  it is created (`Backed up N file(s) to pharn/.backup/<ts> before removing.`), and it is the same one
  directory `--force` uses in that run (`before overwriting and removing.`). Symbolic links, FIFOs and
  sockets inside the directory are not backed up and not followed; the delete removes a link, never its
  target.
- **Addressed where it was installed.** The directory is found at the layout `pharn.config.json`
  recorded, by the capability's validated name, and only ever as a direct child of its role's
  directory (`pharn-pipeline/grillers/` or `pharn-review/`, under `pharn/` in that layout).
- **Refused, with nothing changed,** when the path to it crosses a symbolic link (deleting through it
  would delete files outside the project — delete the directory yourself, then run `update` again), or
  when a file in it cannot be read (an unreadable file is never assumed to be `pharn`'s). Exit 1.
- **Before the writes.** The order is backup → delete → copy → `pharn.records.json` →
  `pharn.config.json`. If the backup fails, nothing is deleted. If a delete fails, nothing has been
  written yet; the config still lists the capability, so the next `update` drops it again.
- **Upstream decides membership.** Which capabilities your archetypes select, and which still exist,
  comes from the fetched `pharn-oss` index — so a capability upstream stops listing for you has its
  directory deleted on your next `update`. That is bounded: only the one directory of a capability your
  `pharn.config.json` lists, addressed by its validated name, with your files backed up first. Preview it
  with `pharn update --dry-run`.
- **Visible beforehand.** The confirm names each dropped capability and the directory it deletes (see
  [Before you confirm](#before-you-confirm)), and defaults to **No** when anything is deleted.
  `pharn update --dry-run` lists the same directories under `WOULD DELETE` (and
  `plan.capabilities.removals` under `--json`) without asking.

This is the **only** thing `update` deletes. It never deletes a file upstream stops shipping inside a
capability it keeps, a tree left behind by a layout change, or anything else, and it never touches
`.claude/settings.json`. Directories that an older `pharn` left behind when it dropped a capability
(it removed only the config entry) have no config entry, so `update` cannot find
them: `pharn list` does not show them, but PHARN still runs them. Delete them by hand. A re-run
[`pharn init`](init.md#dropped-capabilities-are-deleted) deletes the directories of the capabilities it
drops the same way, after listing them in its overwrite prompt.

> **Named limit — removals are not permanent.** `pharn remove` drops the entry from `capabilities`;
> it does not record a tombstone. If your archetypes still select that capability, the next `update`
> re-adds it — but it will now **say so** under `ADDED`, instead of resurrecting it in silence.
> `pharn remove` warns you about this at removal time for an `auto` capability.

## When pharn cannot read a capability upstream

`update` fetches the source your install follows — the newest verified release of `pharn-dev/pharn-oss`
(the default), or the tip of `main` for an install on `--ref main` — so a capability can change upstream in a way
your installed pharn version does not understand yet — a new field value, a directory that does not
have its markdown yet, a shape from a newer release. When that happens `update` **skips that one
capability and says so**; it does not abort:

```text
1 upstream capability could not be read and was SKIPPED — not installed:
  griller:backwards-compat (pharn/pharn-pipeline/grillers) — missing its markdown backwards-compat/backwards-compat.md.
```

What `update` does with it:

- **Nothing under that capability's directory is written into your project.** pharn will not copy
  content it could not validate.
- **Your `pharn.config.json` entry is kept**, reported as `KEPT — pharn could not read these
upstream this run`. A capability you have is not dropped because one fetch could not read it.
- **Everything else updates normally**, including the skills version — so the next
  [`pharn add`](add.md) is not blocked.

pharn records the kept capability in `frozenCapabilities` in `pharn.config.json`. Every run
downloads and re-checks it, so the message repeats while the situation lasts. Once the capability can be read (upstream
finishes the change, or you upgrade pharn with `npm install -g @pharn-dev/pharn@latest`), `update`
brings its files up to date as usual and clears the field — but only once none of that capability's
files had to be skipped. A file of it you edited is skipped as usual, and the capability stays listed,
so every later run checks it again until you resolve the edit or pass `--force`. If you no longer want
the capability at all, remove it with [`pharn remove`](remove.md).

## `pharn is too old for the current pharn-oss`

pharn-oss can ship a root `MIN_CLI` file declaring the **minimum pharn version** its content needs.
When your installed version is older, `init` / `add` / `update` refuse **before writing anything**,
clean up the temporary clone, and exit 1:

```text
⚠ This pharn is too old for the current github.com/pharn-dev/pharn-oss: it requires
  @pharn-dev/pharn v0.9.0 or newer, and v0.4.0 is installed. Upgrade …, then re-run
  this command. Nothing was written.
```

Upgrading is the fix. A `MIN_CLI` file that is missing, unreadable, or malformed imposes **no**
constraint (a warning at most) — only a well-formed version newer than yours ever refuses.

## The decision table

Evaluated per file, first match wins:

| #   | On disk | Records     | Condition                        | Default                 | With `--force`  |
| --- | ------- | ----------- | -------------------------------- | ----------------------- | --------------- |
| 1   | missing | any         | —                                | **write** (restored)    | write           |
| 2   | present | any         | identical to upstream            | **no-op** (unchanged)   | no-op           |
| 3   | present | available   | identical to what pharn recorded | **write** (updated)     | write           |
| 4   | present | available   | differs from what pharn recorded | **skip** `modified`     | back up → write |
| 5   | present | available   | no record for this path          | **skip** `unrecorded`   | back up → write |
| 6   | present | unavailable | —                                | **skip** `unverifiable` | back up → write |

"Identical" in rows 2–4 compares content with line endings ignored in text files: a file that differs
only by CRLF vs LF line endings (for example after a `core.autocrlf=true` checkout) counts as identical,
and a line-ending-only edit is not seen as `modified`. See
[Line endings](../troubleshooting.md#line-endings-windows-coreautocrlf).

A file that is already identical to upstream (row 2) is never a skip, even with no records — and
its record is refreshed, so a degraded install partially heals itself. Partially: it never recovers
records for the files that **differ**, which is exactly the set an upgrade needs to touch. Those stay
skipped until you `--force` them or restore them yourself.

There is a seventh outcome the table cannot cause: a path that is **not a readable regular file** (a
directory where a file belongs, an unreadable file, a symlink — at the path itself or at any parent
directory below your project root) is reported as `unreadable` and skipped — including under
`--force`. It need not exist for that: a dangling parent symlink, or a parent that is a regular file,
also lands here rather than in the restore row, because something is in the way. When a symlink is the
cause the reason **names the offending component**, so a `.claude/hooks` symlinked into a dotfiles repo
is named as that directory; the other cases give a generic reason.

**Each file is written by replacement.** `update` writes the new contents to a temporary file beside the
destination and renames it into place, so it never writes into the existing file. A hard link — a second
name for the same file, which looks like an ordinary file — therefore keeps its other name's contents:
only the name inside your project gets the new bytes. The file keeps upstream's permissions, and an
installed file you made read-only is replaced like any other: what `update` needs is write permission on
its folder.

### The skip labels

- **`modified`** — you changed this file after `pharn` wrote it. This is the label the feature exists
  for.
- **`unrecorded`** — `pharn` has no record of writing this path. Usually a file of your own that
  collides with a path upstream newly added, or a file installed before records existed.
- **`unverifiable`** — there is no usable `pharn.records.json` at all, so nothing can be proven about
  any file. Every install created before `pharn` 0.4.0 starts here (see
  [First update after upgrading](#first-update-after-upgrading)).
- **`held`** — not a reason of its own: the file would have been written, but it belongs to the
  [executable unit](#the-executable-unit-is-upgraded-all-or-none) and another file of the unit was
  skipped.

Skips **exit 0**. A skip is the outcome you asked for, not a failure. `pharn update` also never
**deletes a file** it decides about here: a file upstream no longer ships stays exactly where it is — and is listed, see
[Orphaned files](#orphaned-files). The one thing it deletes is the directory of a capability it drops from
the config — see [Dropped capabilities are deleted](#dropped-capabilities-are-deleted).

## The executable unit is upgraded all or none

Some installed files run together: the floor checkers (`pharn/floor/` — every file `pharn` installs
there, including the `.json` maps the checkers read), the hooks
(`.claude/hooks/*.cjs` / `*.mjs`) and the product commands (`.claude/commands/pharn-*.md`, which call the
floor checkers by name and flag). Upgrading part of that set leaves two versions side by side, and a new
checker that imports something an old, edited sibling does not export fails as soon as it loads.

So when a run **moves you to a new skills version** without `--force` and **any** file of that set would
be skipped (`modified`, `unrecorded`, `unverifiable` or `unreadable`), `update` writes **none** of the
set's other files either. Those are reported as **`held`**. Everything outside the set — capability
directories, the trusted docs, contracts, `pharn-core`, the license and the features README — is still
decided file by file.

Membership is decided by **path only**. `pharn` does not read a file or follow its imports to decide
whether it belongs. Before the question, and again after the run, an `EXECUTABLE UNIT` note names the
files that blocked the set and says how many were held:

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
- When every file that blocked the unit (and every other skipped file) is one **you edited**
  (`modified` or `unrecorded`), the version the run applied is recorded as `pendingSkillsVersion`, as
  for any skip caused only by your edits. [`pharn add`](add.md) then installs at that version: it writes
  capability directories only, which are outside the unit and were upgraded anyway. When any blocker is
  something else (`unverifiable` because there is no usable record store, or `unreadable`), nothing is
  recorded, and `pharn add` refuses until the update can finish. `pharn update --dry-run` shows what
  blocks it.
- A unit file that is **missing** is not put back while the unit is held. The note names such files
  under "Of those, these are not on disk, so they stay missing until the hold ends". For a hook you
  deleted, that means: `pharn` never touches `.claude/settings.json`, so the hook entry stays wired to a
  script that is not on disk, and that guard does not run until the hold ends (revert your edit, or run
  `pharn update --force`). [`pharn status`](status.md) reports the file as missing in the meantime.
- A held file keeps its old record, and a file new upstream gets none. The next run decides them again.
- The run **exits 0**, like every skip: nothing you edited was overwritten and nothing failed. The note is
  the signal, not the exit code.
- `--force` never holds. It backs up the skipped files and writes the whole set (an `unreadable` path is
  still skipped, as always).
- At the **same** skills version (a run that restores a missing file, for example) nothing is held:
  restoring a file then puts back bytes of the version you already have.

What `pharn` can promise here is only that it wrote no file of the set. It cannot prove that your edited
files work together, and a file that was already identical to upstream before the run is left as it is.
Editing a `/pharn-*` command, including its `model:` or `effort:` line, also holds the floor and the hooks
until you revert the edit or use `--force`.

`--dry-run` prints the same note, and `--dry-run --json` adds `plan.executableUnit` (see
[JSON output](#json-output)).

## Orphaned files

When upstream stops shipping a file `pharn` installed — a `pharn-*` command, a hook, a floor checker, a
trusted doc, or one file inside a capability you still have — `update` leaves it on disk: the only thing
it deletes is a dropped capability's directory. Such a file is an **orphan**: `pharn.records.json` says `pharn` wrote it, it is no longer
part of your install, and it is still there. A leftover `.claude/commands/pharn-*.md` is still a live
slash command, and a leftover hook or checker still runs if anything calls it, so `update` names every
orphan in an `ORPHANED` note:

```text
  Upstream no longer ships these files pharn installed. pharn never deletes
  them, and keeps listing each one until it is gone.

  UNCHANGED — unchanged since pharn wrote it
  .claude/commands/pharn-old.md

  EDITED — changed since pharn wrote it — review before deleting
  .dev/floor/check-old.mjs

  Delete the ones you no longer need by hand (e.g. `git rm <path>`).
```

- **`UNCHANGED`**: the file still has the exact bytes `pharn` recorded writing.
- **`EDITED`**: it changed since then — the change is yours, so look before deleting.
- **`UNREADABLE`**: something other than a readable regular file sits there (a directory, a symlink, an
  unreadable file), named with the reason. `pharn` does not read through it.

Each group shows at most 20 paths, then `… and N more`; `pharn status --json` lists them all. An orphan
is never a skip: it does not withhold the version bump and does not appear in `SKIPPED`.

**It stays listed until you delete it.** `update` keeps the orphan's entry in `pharn.records.json` (its
old hash, unchanged) for as long as the file exists, so every later `update` — and every
[`pharn status`](status.md#orphaned-files) — still names it. Once the file is gone, the next `update`
drops its entry, at the same skills version too: it restores nothing (upstream no longer ships the
file), drops the entry, and the run after that is up to date again. If upstream ships the path again later, the kept entry makes it a clean `updated` instead of an
`unrecorded` skip. A re-run `pharn init` keeps those entries too.

What is **not** listed:

- Files `pharn` has no record of — an install made before records existed, or files written while
  `pharn.records.json` was unusable. With no usable store, nothing is listed.
- The files of a capability this update **drops** from your config: that is a membership change, named
  in the `CAPABILITIES` note, and its directory is deleted (see
  [Dropped capabilities are deleted](#dropped-capabilities-are-deleted)).
- Anything outside the paths an install can write (`.claude/commands/pharn-*.md`, `.claude/hooks/*.cjs` or `*.mjs`,
  the capability directories, `pharn-contracts/`, `pharn-core/`, the floor directory, the trusted docs,
  the PHARN license and the features `README.md`, in either layout) — even if a hand-edited
  `pharn.records.json` names it.

Every run plans, so an up-to-date run prints the `ORPHANED` note too;
[`pharn status`](status.md#orphaned-files) reports orphans whenever it runs its drift check.
`--dry-run` prints the same note, and `--dry-run --json` lists them in `plan.orphans` when its `status` is
`planned`; an `up-to-date` report has `plan: null`, so use `pharn status --json` (`orphans`) to list them then.

## `--force` and `pharn/.backup/`

`--force` overwrites all three skip buckets — but every affected file is first copied, with its
relative path preserved, into:

```text
pharn/.backup/<YYYYMMDD-HHMMSS>/
```

The directory is printed when it is created — on **both** paths. If the update then fails part-way
(a directory it cannot delete, a file it cannot write, a config it cannot save), it still names the
directory before exiting 1, alongside a line telling you some originals may already have been
overwritten (or removed). The same directory holds the files saved from
[dropped capabilities](#dropped-capabilities-are-deleted), with or without `--force`. That path is your only
route back to your pre-overwrite bytes, so it is never withheld at the moment you need it most, and
earlier runs may have left other timestamped directories beside it.

If **any** backup copy fails, nothing is printed and nothing is at risk: the update aborts before a
single original is touched. A colliding timestamp directory is never written into — the run
uniquifies (`…-2`, `…-3`) instead, so a second `--force` in the same second cannot overwrite the only
surviving copy of your edits.

To restore a file, copy it back:

```bash
cp pharn/.backup/20260807-091500/pharn/CONSTITUTION.md pharn/CONSTITUTION.md
```

**Retention is yours.** `pharn` never prunes `pharn/.backup/`, so backups accumulate. They are kept out
of git by the `pharn/.backup/` line `update` (and `init`) append to your `.gitignore` — see
[`.gitignore`](#gitignore). Delete them once you are happy.

## Release channel

`update` follows the channel your install records. An install that follows **releases** (`"ref":
"latest"` — what `pharn init` writes by default) gets the newest **GitHub release** — a tag pharn-oss
creates only once every required check on that commit has passed after the merge — at exactly the
commit the tag points at, never a commit whose CI is unfinished, cancelled or red. An install with no
`ref` (made with `--ref main`, or before `--ref` existed) gets the tip of `pharn-dev/pharn-oss` `main` —
whatever merged last.

- **An install on `main` is never moved for you.** Verified releases are the default for _new_ installs
  only. An `update` on a `main` install keeps it on `main` and prints one line saying so:
  `Verified releases are now the default for new installs. This install keeps following pharn-oss main;
run`pharn update --ref latest`to switch (recorded on first use).` It prints on every such run —
  an up-to-date run and `--dry-run` included — but not when you pass `--ref`, and not under
  `--json` (the report's `channel` says `main`).

- **The channel is recorded.** `pharn update --ref latest` writes `"ref": "latest"` to
  `pharn.config.json`, so later `update`, `add` and `status` runs keep following releases.
  `pharn update --ref main` switches back and removes the key. A switch re-applies even at the current
  version, so it is recorded.
- **No fallback.** When the release cannot be resolved (none published, `api.github.com` unreachable or
  rate-limited), `update` exits 1 before cloning and names `--ref main`. See
  [No verified release could be resolved](../troubleshooting.md#no-verified-release-could-be-resolved).
- **Ahead of the release.** An install made from `main` can be newer than the newest release. Applying
  the release would be a downgrade, so `update --ref latest` says so and exits 0 without changing
  anything. `--ref main` switches back to `main`; `--force` goes back to the release (backing up your
  edits as usual). See [An install ahead of its source](#an-install-ahead-of-its-source).

### An install ahead of its source

`update` never moves your install to an **older** version without being asked. On either channel, when
the version you have is newer than the one the source offers, it reports that, changes nothing, and
exits 0:

- **On `--ref latest`** — the install came from `main` and the release at its version is not cut yet
  (above).
- **On `main`** — pharn-oss `main` has **moved back**: a revert took its `SKILLS_VERSION` below the one
  you installed from it. Without this check, `update` would have shown `v2.0.0 → v1.0.0` and applied the
  older files over every clean one. It now prints
  `Your install (skills v2.0.0) is newer than pharn-oss main (v1.0.0) — main has moved back to an older version. Nothing changed.`
  Wait for `main` to move forward again, or pass `--force` to downgrade (your edits are backed up first,
  as usual).

A `pendingSkillsVersion` counts too: when the last run withheld the version bump only because of your kept
edits, every file outside those edits (and outside an executable unit they held back) is already at that
version, so an upstream older than it is refused the same way
even if your recorded `skillsVersion` is older still. The check runs before the download and the plan
— so nothing a plan would do (re-check a kept unreadable capability, restore a deleted `models` block,
record a `--ref` switch) happens, and `update --ref main` on a release install that is ahead of `main`
changes nothing, the switch included. `--dry-run` reports the same outcome, and `--dry-run --json` reports it as `status`
`ahead-of-release` or `ahead-of-main` with `plan: null`. `--yes` does not skip it; only `--force` does.
`pharn status` reports such an install as **ahead**, not outdated, and `--strict` does not fail on it.
A version that cannot be ordered (not a plain `X.Y.Z`) is never treated as ahead.

## The `models` block

`models` in `pharn.config.json` is **pharn-oss's** block: the source of truth each `/pharn-*`
command's `model:` / `effort:` frontmatter is held to, and which `/pharn-ship` and `/pharn-loop` read to
pick the model they request for the stages they route (see
[pharn.config.json](../reference/pharn-config.md#models)). `update` decides it with the table above,
using the block's hash where a file would use its bytes, and prints a `MODELS` note for every outcome
except "already identical":

| Your block                                                                | Default                   | With `--force`                               |
| ------------------------------------------------------------------------- | ------------------------- | -------------------------------------------- |
| absent                                                                    | pharn-oss's is written    | same                                         |
| identical to pharn-oss's                                                  | nothing to do             | same                                         |
| still what `pharn` wrote — its recorded hash                              | replaced with pharn-oss's | same                                         |
| changed since `pharn` wrote it, never recorded, or no usable records file | **kept**                  | `pharn.config.json` backed up, then replaced |

"What `pharn` wrote" is compared as `pharn` writes it: re-indenting the file is not an edit, but
reordering the block's keys is — so a reordered default counts as yours and is kept, never replaced.
The block's record lives in [`pharn.records.json`](../reference/pharn-records.md#the-models-block).

**A kept block pharn-oss's rules reject** — one you edited into an invalid shape, or one in the format
`pharn` wrote before 0.7.0 (a top-level `default`, and model ids such as `opus-4-8` that neither Claude
Code nor pharn-oss's checker accepts) — stays exactly as it is, and the `MODELS` note lists what the
rules reject in it. To replace it, either edit the block by hand, or delete the `models` key from
`pharn.config.json` so the next `pharn update` writes pharn-oss's (the "absent" row above). `--force`
replaces it too, after backing up `pharn.config.json`, but it also overwrites every other file you
edited. An old-format block is replaced without asking only when its recorded hash proves `pharn` wrote
it; `pharn` no longer converts the old format (0.19.x was the last release that did).

A kept block never holds back the skills version, unlike a skipped file: your `models` block is
configuration, and a block you tuned is a steady state, not an unfinished upgrade. Keep in mind what
the block is for, though — if your values differ from the installed commands' frontmatter,
`node pharn/floor/check-model-config.mjs agreement` lists where (nothing runs it automatically).
Editing the frontmatter of a `/pharn-*` command is a different edit: that file becomes `modified`, so
`update` skips it and **does** withhold the skills-version bump, until you restore it or use `--force`.
Editing only the block causes no file drift, and a re-run `pharn init` resets it (copying the previous
`pharn.config.json` to `pharn/.backup/` first).

If pharn-oss ships no block, yours is left alone, and what its rules reject in it is listed. If pharn-oss
ships one this `pharn` cannot accept — pharn-oss's rules can move ahead of the copy of them in your
`pharn` — the block is not applied, the reasons are listed, and upgrading `pharn` fixes it.

## Non-interactive use (CI, scripts, pipes)

`update` confirms before it writes, so it needs either a terminal or your explicit consent. Off a TTY —
in CI, a pipe, or any script — it **exits 1** with a usage error rather than rendering a prompt nobody
can answer:

```console
$ echo "" | pharn update
■ pharn update needs to confirm before it writes. Run it in an interactive terminal,
  or pass --yes to confirm automatically (e.g. `pharn update --yes`).
$ echo $?
1
```

The refusal happens **before any network call** — no version check, no clone — and writes nothing.

Pass `--yes` (`-y`) to give that consent up front:

```bash
pharn update --yes            # the usual CI line
pharn update --yes --force    # the full re-apply: overwrite local edits too
```

`--yes` skips **the confirmation prompt and nothing else**. Everything else is byte-identical to an
interactive run: the version note still prints, the same per-file decision table applies, files you
edited are still skipped (not overwritten), the recorded version is still withheld when anything was
skipped, and the exit codes are unchanged. It means "do not ask" — not "non-interactive mode" — so it
works in a terminal too.

Because `--yes` is only consent, it is **not** a drift check: a run that skips your edited files still
exits 0. Use [`pharn status --strict`](status.md) when you want CI to fail on drift.

`--force` does **not** imply `--yes`. Overwriting your edits is the most destructive thing `update`
does, so it still asks — `pharn update --force` in a pipe is refused exactly like a bare one.

> [`pharn init --yes`](init.md#install-without-prompts---yes) skips init's "Ready to install?" question
> but never confirms an overwrite: it installs only into a project where none of its files exists yet.

## Before you confirm

`update` downloads and plans **before** it asks, so the question can say what the run changes. When the
update adds or drops capabilities, a `CAPABILITIES` note lists them first, in the same words the
[dry run](#previewing-an-update) uses:

```text
◇  CAPABILITIES
│    ADDED — newly selected for your archetypes
│    griller:a11y
│
│    REMOVED — no longer selected for your archetypes
│    lens:stale — directory would be deleted (1 file(s) would be backed up first)
│
│    Removed capabilities’ directories would be deleted, so PHARN would no longer run them.
│    Files in them pharn did not write would be copied to pharn/.backup/ first.
```

With `--force`, an `OVERWRITE` note then lists every file the run will overwrite, grouped by why each
needed `--force` — the same groups as the dry run's `WOULD OVERWRITE (--force)` — and
`pharn.config.json` when your `models` block is replaced:

```text
◇  OVERWRITE
│    WILL OVERWRITE (--force) — modified
│    pharn/CONSTITUTION.md
│
│    Each is copied to pharn/.backup/<timestamp>/ first (1 file(s)).
```

The question is `Apply this update?` (`Apply this update and overwrite your changes?` with `--force`).
When the update deletes a capability directory it adds how many — `It deletes 1 capability directory.` —
and the default answer becomes **No**, as `pharn init` does when it would overwrite or delete. With
nothing to delete the default stays Yes. Declining exits 0 with nothing written. `--yes` prints the same
note and skips only the question, so a CI log names what the run changed.

The list is a snapshot. After you answer, `update` takes the project lock and plans again from the same
download (no second download) against your project as it is then: which files are skipped, backed up and
written is decided there. The capabilities it changes and the directories it deletes must match what you
were shown. If they do not — for example a dropped capability's directory reappeared while the prompt was
open — the run stops with `The capabilities this update would change are no longer what you confirmed`,
naming both sides, exit 1, nothing changed; run `pharn update` again.

The cost of asking with that knowledge: the ~2.5 MB download happens before the question, so answering No
— or a run refused by another pharn process's lock — has already downloaded it (and removed it again).
The terminal check still comes first: off a terminal without `--yes`, `update` refuses before any network
call.

## When there is nothing to change

A run whose plan changes nothing does not ask and does not write. "Nothing" means all of these: no file
to write or restore, no capability directory or root doc to delete, nothing to move, no line to add to
`.gitignore` or `.prettierignore`, the same `pharn.records.json`, and the same `pharn.config.json` apart
from `updatedAt` and `pharnVersion`. Those two describe a write, not your install, so they change only on
a run that writes something — a run that changes nothing leaves `pharn.config.json` byte for byte, and
`git status` clean.

The common case is a [kept edit](#the-recorded-version-stays-true): the version bump is withheld, so every
later run still plans, and before 0.20.0 each one asked to confirm and rewrote `pharn.config.json` with a
new `updatedAt`. Now such a run prints its notes — the `SKIPPED` note naming your edit, the withheld-version
warning — and ends with:

- `Nothing to change.` when something is skipped or the recorded version is behind upstream;
- `Up to date.` when nothing is skipped and the recorded version is the one upstream ships.

A [held executable unit](#the-executable-unit-is-upgraded-all-or-none) counts the same way: the first held
run that records `pendingSkillsVersion` changes `pharn.config.json`, so it asks and writes even when no file
is written; the runs after it change nothing until something does: you revert the edit, run with `--force`, or upstream moves on.

The comparison is made against `pharn.config.json` as `pharn` reads it, so a value the reader already
resolves never forces a write on its own: no `commit` key is `null`, a `ref` other than `"latest"` is
`main`. A real difference — you switch channel, a new commit — still changes the file.

The terminal check is unchanged: off a terminal without `--yes`, `update` still refuses before any network
call, because it cannot know the plan until it has downloaded. The [dry run](#previewing-an-update) says
`Nothing would be written.` and ends `Dry run — Up to date.` (or `Nothing to change.`) for the same plans,
and `--dry-run --json` reports them as `status` `up-to-date` with `plan: null`. Since 0.20.0 this is the
only "up to date": every run, at the current skills version too, downloads pharn-oss (about 2.5 MB) and
plans before it can say so.

## Concurrency

`update` takes the project lock (`pharn/.lock`) **before** it reads `pharn.config.json` or touches the
network, and holds it across the download, the plan, the confirm and the writes. While it waits for your
answer, a second `pharn` writer refuses with a named message and exit 1 rather than queueing; `pharn list`
and `pharn status` never take the lock, so `pharn status --strict` stays runnable in CI while an update is
in flight. A refused run reads nothing and fetches nothing. `--dry-run` takes no lock. See
[Another pharn process is running](../troubleshooting.md#another-pharn-process-is-running).

## The recorded version stays true

If a run skipped anything, it **does not** advance the `skillsVersion` / `commit` in
`pharn.config.json`. Those fields describe the last **complete** state, so:

- `pharn status` keeps reporting that an update is available — because one genuinely is,
- and the next `pharn update` still has work to do instead of exiting early forever.

Once the skips are resolved (you revert the files, or re-run with `--force`), the run is complete and
the version advances. The trade-off is deliberate: a project that permanently keeps a local edit to a
PHARN-owned file will keep showing as outdated, which is the honest report.

## First update after upgrading

Installs created before `pharn` 0.4.0 have no `pharn.records.json`. On the first `pharn update` after
upgrading, every file that differs from upstream is skipped as `unverifiable` — `pharn` cannot tell
your edits from upstream's changes, and guessing is exactly what it refuses to do.

Resolve it once, either way:

- `pharn update --force` — overwrite them, keeping a backup of the current bytes; or
- inspect the listed files first (`pharn status` shows the same set), revert what you did not intend
  to keep, and re-run `pharn update`.

Either path writes a full record store, and every later update is precise.

## Missing files at the same skills version

When your `skillsVersion` already equals upstream's, `update` still downloads and plans, so a missing
file is restored like on any other run: a capability directory or a recorded file that is gone, the
[review lens agent](#the-review-lens-agent-claudeagents) an older `pharn` never installed, or a surface a
newer `pharn` release installs that your install never had. The per-file table always `restore`s a
missing file, so your edits elsewhere are still kept and no `--force` is needed. `--dry-run` shows it
under `WOULD WRITE — restored`, and `--dry-run --json` reports `status` `planned`. After that run the
install is complete again and the next `update` answers `Up to date.`

A path that goes through a symbolic link is never followed and is not restored — `update` refuses to
write through a link — and neither is a path blocked by a file where a directory should be: the run
skips it (`Nothing to change.` when that is all it finds), and [`pharn status`](status.md) reports it.

A capability you removed with [`pharn remove`](remove.md) is restored too when your archetypes still
select it: every run re-resolves them (see
[Removing an auto-selected capability](remove.md#removing-an-auto-selected-capability)).

## A records store from an interrupted run

[`pharn.records.json`](../reference/pharn-records.md) records the `skillsVersion` and `commit` of the
`pharn.config.json` it was written with. `pharn add` and `pharn update` write the store first and the
config second, so a run interrupted between the two (a crash, a full disk, Ctrl-C) leaves a store
stamped for a state the config never reached.

`update` uses such a store as it is: a file whose current hash equals its recorded hash holds bytes
`pharn` wrote, whatever version the store was written for. At the same skills version the run rewrites
the store with the config's stamp and changes nothing else, and on the next upstream release every
file you did not edit upgrades, every file you edited is skipped as `modified`, and no `--force` is
needed. Earlier releases made the stamp a gate: such a store was ignored, that release read every
differing file as `unverifiable`, and the files then lost their records and read as `unrecorded` on
every later run, until `--force`.
The two edge cases of trusting the hash alone are in
[The stamp is not a gate](../reference/pharn-records.md#the-stamp-is-not-a-gate).

A store that is **absent** or **unreadable** (invalid JSON, an unknown `schemaVersion`) is still not
used: every present file that differs from upstream is `unverifiable` and the run names the reason.
Every file that matches upstream is recorded again, so a plain `update` at the same skills version writes
a new store over the unreadable one (copy it aside first if you want to repair it by hand). The record of
a `.claude/settings.json` that `init` created cannot be rebuilt that way: `update` never writes that file.

## A surface added by a newer CLI, at the same skills version

When a **new `pharn` release starts installing a surface that earlier releases did not** — as the
release adding `pharn/pharn-core/` does — an install pinned at the _current_ skills version is missing
those files. [`pharn status`](status.md) reports them as `missing`, and `pharn status --strict` exits
`1`, until a plain `pharn update` restores them: every run compares every file against upstream, at the
same skills version too (missing files are always `restore`d — there is nothing local to protect).

### The review lens agent (`.claude/agents/`)

pharn-oss ships `.claude/agents/pharn-review-lens.md` from skills version 6.64.0 on: the subagent
`/pharn-review` runs each lens in (without it, each lens runs as a general-purpose agent with more
tools). Earlier `pharn` releases did not install it. A plain `update` adds it, at any skills version that
ships it, with no `--force`, and records it; the next `update` answers `Up to date.`, and a later deletion
is [restored](#missing-files-at-the-same-skills-version) like any recorded file. An edited agent is kept
as `modified`, and a `.claude/agents` that is a symbolic link is never written through.

## Layout migrations

There are none any more. The legacy `flat` layout (PHARN's files at the project root, `"layout": "flat"`
in `pharn.config.json`, or no `layout` key) was deprecated in v0.20.0 and removed in v0.21.0 (shortened
from v0.22.0; [support policy](../support-policy.md#the-flat-layout-is-removed)). `pharn` 0.20.x is the
last version that moved a flat install to `pharn/`.

- **An install recorded at `flat`.** `update` (and `--dry-run`, `--json`) exits 1 before it downloads
  anything, with one message: re-run `pharn init`. `init` reinstalls at the `pharn/` layout and keeps the
  capabilities you added with `pharn add` ([init](init.md)). It never moves or deletes the old top-level
  copies: the ones `pharn` recorded stay recorded, and `pharn status` and `pharn update` list them under
  `ORPHANED` until you delete them by hand (or `pharn uninstall` removes the unchanged ones).
- **A fetched pharn-oss in the flat layout.** Every such release predates `pharn-install.json`, so the
  fetch refuses it and nothing is written.

## The root-footprint migration

Removed in v0.21.0 (shortened from v0.22.0); `pharn` 0.20.x is the last version that ran it. An install
made from a pharn-oss older than 7.0.0 left `THREAT-MODEL.md` and `LIMITS.md` at the project root; earlier
`pharn` releases deleted those root copies once the `pharn/` copies had landed, printed a
`ROOT MIGRATION` note and hinted at moving a root `memory-bank/` or `pharn.spec-template.md`. Now:

- `update` installs `pharn/THREAT-MODEL.md` and `pharn/LIMITS.md` and leaves the root copies alone. A root
  copy `pharn` recorded is listed under `ORPHANED` (with its state: unchanged or edited) and keeps its
  record, like any file upstream stopped shipping; delete it by hand, or let `pharn uninstall` remove it
  while it still equals its record.
- Root `memory-bank/`, `pharn.spec-template.md` and `.pharn/` are never moved, copied, deleted or
  mentioned, and `.gitignore` gets no replacement hint for an old `.pharn/` line.
- `--dry-run --json` reports `plan.rootMigration` as the constant `null`.

## A surface pharn-oss does not ship

Every product surface `update` installs is optional on the way in, as for [`init`](init.md#a-surface-pharn-oss-does-not-ship):
a clone that ships nothing for one (the commands, the hooks, a trusted doc, pharn's `LICENSE` copy,
`features/README.md`, or the contracts, `pharn-core` or floor dir) is still applied. A run that
plans — the real one and `--dry-run` alike — names each such surface in a `NOT SHIPPED` note, by
path and kind, with the same wording as `init`. It is reported, never a skip: nothing on disk was
left behind by it, so it does **not** withhold the `skillsVersion` bump. Every run plans, so an
up-to-date run names it too; [`pharn status`](status.md) names it on every run and fails `--strict`
while it lasts. Hooks are installed as `.cjs` or `.mjs` files (never
`*.test.cjs` / `*.test.mjs`); an `.mjs` hook's name is held to the same filename allowlist as a `.cjs`
one, so a name outside it refuses the run.

## `.gitignore`

Like [`init`](init.md#gitignore), every applied `update` makes sure your root `.gitignore` covers
`pharn/.run/` (PHARN's runtime scratch) and `pharn/.backup/` (these backups), appending only the
missing lines — created if absent, your bytes kept exactly, CRLF kept, equivalent spellings and your
own negations respected, never written through a symlink. It runs after the config write, under the
lock, and prints `Added … to .gitignore` (or `Created .gitignore with …`); a refusal or a failed write
is a warning naming the lines, never a failed update.

**At the same skills version** too, a `.gitignore` missing either line makes the plan add it, so an
install made before 0.16.0 gets the lines on its next `update`, and the following run is up to date. A
`.gitignore` pharn cannot write (a symlink, a directory, unreadable) is a warning, and the run is otherwise
up to date. One residual: a regular file whose write keeps failing (no permission) asks and fails to write
on every run, each with its warning.

`--dry-run` prints `.gitignore: would add …`, and `--dry-run --json` carries `plan.gitignore`.

## `.prettierignore`

In a project that uses Prettier, every applied `update` makes sure the root `.prettierignore` covers the
files it records writing, the same way [`init` does](init.md#prettierignore) — the same detection, the
same derived lines (including `/pharn/features/`, `/pharn.config.json` and `/pharn.records.json`), the
same append-only rules. It runs after `.gitignore`, under the lock, and prints `Added N paths to
.prettierignore …` (or `Created .prettierignore with …`); a refusal or a failed write is a warning
listing the lines, never a failed update.

**At the same skills version** too, a `.prettierignore` that does not cover the files the run records
makes the plan add the lines, so an install made before 0.17.0 — or a project that adopted Prettier later
— gets them on the next `update`, and the following run is up to date. A file pharn cannot write is a
warning; a write that keeps failing asks and fails on every run.

If you already ran `prettier --write` over pharn's files, they now read as changed: add the lines (or
let `update` add them), then `pharn update --force` puts pharn-oss's bytes back, backing your copies up
first.

`--dry-run` prints `.prettierignore: would add …`, and `--dry-run --json` carries `plan.prettierignore`.

## What is protected by default

- `.claude/settings.json` — your Claude Code configuration. `init` writes it only when absent; `update`
  **never** touches it at all (not even with `--force` — it is not in the install manifest). When `init`
  created it, `update` keeps the hash `init` recorded for it in `pharn.records.json` while the file
  exists, so [`uninstall`](uninstall.md) can still remove it unchanged; a deleted file is not put back,
  and its record is dropped by the next update that has work to do. It does
  compare the hooks of that file and `.claude/settings.local.json` with the fetched upstream ones. It
  prints a `HOOKS` note naming every hook upstream wires that neither file does. Matching is textual,
  so an equivalent hook you wrote differently is listed too. Each line is the hook as JSON. A hook
  whose script you already wire in another spelling (same event and matcher) is listed under
  `REPLACE`, with your current line, so you swap it rather than add a second one; the rest are
  listed under `ADD`. The note also names hooks wired only in `settings.local.json`, which run for you but
  not for your teammates. See [status](status.md#what-is-intentionally-excluded) for the full rules.
- `pharn/CONSTITUTION.md` — protected like every other manifest path: if you have edited it, it is a `modified`
  skip by default. `--force` overwrites it too, after copying the current bytes to `pharn/.backup/`.
  (Before 0.4.0 `update` silently overwrote a hand-edited constitution despite docs claiming otherwise —
  that is fixed.)

## Related

- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
- [pharn.records.json](../reference/pharn-records.md) — the per-file hash baseline this command reads
- [status](status.md) — the read-only report of what has drifted
- [add](add.md)
