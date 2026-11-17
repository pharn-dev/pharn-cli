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

These are `update`'s **only** options, and they compose: `--json` implies `--dry-run`, and `--compact`
implies `--json`. Any other option, an extra positional, a value on an on/off option (`--json=false`), a
negated option (`--no-dry-run`) or a second `--ref` exits **1** with one stderr line (see
[Unsupported option for this command](../troubleshooting.md#unsupported-option-for-this-command)).

`update` compares every PHARN-owned file against the per-file hashes recorded when it was installed
([`pharn.records.json`](../reference/pharn-records.md)). A file whose bytes are exactly what `pharn`
wrote is upgraded. A file it cannot prove is untouched is **skipped and listed**, never overwritten.

## Behavior

1. **Node and lock.** On a Node older than **24.2.0** (the floor PHARN's installed checkers need), or one
   whose version cannot be read, `update` exits 1 with nothing written; `--yes` and `--force` do not skip
   it. Then it takes the project lock (`pharn/.lock`) before it reads anything or touches the network, and
   holds it to its last write, so a second writing `pharn` command is refused rather than queued (see
   [Another pharn process is running](../troubleshooting.md#another-pharn-process-is-running)).
   `pharn list`, `pharn status` and `--dry-run` never take the lock.
2. **Config.** Reads `pharn.config.json`. If none exists, or it is a pre-archetype (module) config, or
   one recorded at the removed `flat` layout ([details](../reference/update-advanced.md#an-install-recorded-at-the-flat-layout)),
   it exits 1 with a hint to run `pharn init`. A config that is present but **invalid** gets its own
   named error and exit 1, not that hint. A configured proxy is reported once here, before either fetch.
3. **Source.** Resolves the newest **verified release**, or the tip of `main` for an install that records
   no `ref` ([Release channel](#release-channel)). An unresolvable release stops the run (exit 1). An
   install [ahead of that source](#an-install-ahead-of-its-source) is left as it is (exit 0) unless you
   pass `--force`.
4. **Download and plan.** Downloads the repo (SHA-pinned) and plans, at the same skills version too, so
   a plain `pharn update` also restores a missing file or `models` block, adds a missing ignore line,
   records a `--ref` switch and re-checks a capability it kept unread. The plan checks
   [`MIN_CLI`](../troubleshooting.md#pharn-is-too-old-for-the-current-pharn-oss), **re-resolves your
   `archetypes`** against the latest capability index and **unions** the result with the capabilities you
   added by hand. A failed download, a `MIN_CLI` refusal, or a dropped capability whose directory cannot be
   deleted safely stops the run here (exit 1), before you are asked anything.
5. **Confirm.** If the plan [changes nothing](#when-there-is-nothing-to-change), it asks nothing, writes
   nothing and exits 0. Otherwise it shows the version bump (or `(re-applying)`) with a pointer to
   `CHANGELOG.md`, what it adds, drops and (under `--force`) overwrites ([Before you confirm](#before-you-confirm)),
   and asks. `--yes` skips that one prompt and nothing else.
6. **Apply.** On confirm it applies the plan you were shown: it plans once. A file (or
   `pharn.config.json`) you edit while it waits stops the run before anything is written (see
   [Edits made while update waits for your answer](#edits-made-while-update-waits-for-your-answer)).
   Otherwise, in order: the [backup](#--force-and-pharnbackup), the deletes of
   [dropped capabilities](#dropped-capabilities-are-deleted), each write the [decision table](#the-decision-table)
   allows, `pharn.records.json`, `pharn.config.json` (`pharnVersion`, `updatedAt`; `installedAt` kept), and
   the `.gitignore` and `.prettierignore` lines.

### Edits made while update waits for your answer

Before its first write, `update` compares every file it is about to write with what it saw when it
planned. A file whose bytes changed (or that appeared) stops the run, exit 1 even with `--force`:

```text
■  A file changed while `pharn update` was waiting for your answer:
     pharn/CONSTITUTION.md
   Nothing was written, and your edit is kept. Run `pharn update` again: it plans the file as
   changed by you and leaves it alone (or, with --force, backs it up first).
```

A file put back with exactly upstream's bytes is not an edit; a hand-edit of `pharn.config.json` stops the
run too. It stops rather than skips because the rest of the plan (the recorded version, the
[executable unit](../reference/update-advanced.md#the-executable-unit-is-upgraded-all-or-none)) rests on
the bytes you changed; the re-run decides again.

## Previewing an update

```bash
pharn update --dry-run          # what would a plain update do?
pharn update --dry-run --force  # ...and what would --force overwrite and back up?
pharn update --dry-run --ref latest
```

`--dry-run` runs the same checks, download and per-file decisions as a real update (a `MIN_CLI` refusal
still exits 1), prints the result, and exits **0** having **written nothing**: no project file, no state
file, no `pharn/.lock`, no `pharn/.backup/`. It needs no terminal, never asks, and skips the lock and the
check that the config did not change under you. It prints:

- `PLAN`: the files it would **write** (`restored`, `updated`), under `--force` the ones it would
  **overwrite** (`modified`, `unrecorded`, `unverifiable`, and `pharn.config.json` when your `models`
  block would be replaced), the capability directories it would **delete** (`WOULD DELETE`), the files
  it would **back up** first (the `<timestamp>` is known only when a real run makes it), the counts of unchanged and skipped files, and the channel it would
  record when `--ref` changes it;
- `Nothing would be written.` when a real run would change nothing, or `Would rewrite only
pharn.config.json` (or `pharn.records.json`, or both) when those are all it would change;
- the `SKIPPED`, `CAPABILITIES`, `MODELS`, `HOOKS`, `ORPHANED` and `NOT SHIPPED` notes, worded as what
  _would_ happen, and whether the recorded `skillsVersion` would be **withheld** (and recorded as
  pending).

It is a **snapshot**, not a promise: a real run fetches and plans again under its own lock. The only
thing a dry run creates is the download's directory under your OS temp directory, removed before it exits.

### JSON output

`pharn update --json` prints the same plan as **one JSON object** on stdout and nothing else, and exits 0;
the outcome is its `status` (`planned`, `up-to-date`, `ahead-of-release`, `ahead-of-main`), and `--compact`
leaves out the unchanged files. Keys and an example: [JSON output reference](../reference/json-output.md#update).

## What happens to your capability list

`update` does **not** replace `capabilities` with the resolved set. It writes the union:

```text
next capabilities = resolve(your archetypes, latest index)   ← the `source: "auto"` set
                  ∪ every `source: "manual"` entry still in the latest index
```

A capability you added with [`pharn add`](add.md) **survives an update that does not select it** while it
still exists upstream; an entry both manual and re-selected stays `manual`. One you removed with
[`pharn remove`](remove.md) returns, as `auto` under `ADDED`, when your archetypes still select it: a removal
is not a tombstone. See [`capabilities[].source`](../reference/pharn-config.md#capabilitiessource--selection-provenance).

**Every membership change is named** in a `CAPABILITIES` note (nothing is printed when nothing changed):

| Reported as                                               | Meaning                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ADDED — newly selected for your archetypes`              | New upstream for your archetypes, or re-selected after a remove                                                                 |
| `REMOVED — no longer selected for your archetypes`        | An `auto` entry your archetypes no longer select                                                                                |
| `REMOVED — no longer exists upstream (was a manual add)`  | A `manual` entry whose capability is gone from the index                                                                        |
| `KEPT — your manual add, not selected by your archetypes` | A pre-`source` entry preserved as manual (printed once)                                                                         |
| `KEPT — pharn could not read these upstream this run`     | [A capability this pharn version could not parse](../reference/update-advanced.md#when-pharn-cannot-read-a-capability-upstream) |

A `REMOVED` line also says `directory deleted`, `directory deleted (N file(s) backed up first)` or `already gone`.

### Dropped capabilities are deleted

PHARN runs the grillers and lenses it finds **on disk**, not those `pharn.config.json` lists, so a dropped
capability would keep running if its directory stayed. `update` **deletes that directory** in the same run,
the way [`pharn remove`](remove.md) does:

- **Backed up first.** Every regular file in it that is not provably `pharn`'s own unchanged bytes (a file
  you added or edited, and **every** file when there is no usable `pharn.records.json`) is copied to
  `pharn/.backup/<timestamp>/` before the first delete, announced as
  `Backed up N file(s) to pharn/.backup/<ts> before removing.` (`before overwriting and removing.` when
  `--force` shares the directory). A file still at the hash `pharn` recorded is not copied: `pharn add` can
  install it again. The set is read again at the delete, so a file you add meanwhile is saved too. Symbolic links,
  FIFOs and sockets inside are not backed up and not followed; the delete removes a link, never its target.
- **Addressed where it was installed**: by the capability's validated name, only ever as a direct child of
  `pharn/pharn-pipeline/grillers/` or `pharn/pharn-review/`.
- **Refused, with nothing changed** (exit 1), when the path crosses a symbolic link (delete the directory
  yourself, then re-run) or a file in it cannot be read (an unreadable file is never assumed to be `pharn`'s).
- **Before the writes.** A failed backup deletes nothing; a failed delete has written nothing yet, and the
  config still lists the capability, so the next `update` drops it again.

Upstream's index decides membership, so a capability upstream stops listing for you is deleted on your
next `update` (preview it with `--dry-run`, `WOULD DELETE`). Apart from its lock and download, that
directory is all `update` deletes: never a file upstream stops shipping
inside a capability it keeps ([orphans](../reference/update-advanced.md#orphaned-files)), and never
`.claude/settings.json`. Every delete `pharn` makes is listed in [What PHARN deletes](../reference/deletes.md).
A directory an older `pharn` left behind when it dropped only the config entry has no entry, so `update`
cannot find it (`pharn list` does not show it, but PHARN still runs it): delete it by hand. A re-run
[`pharn init`](init.md#dropped-capabilities-are-deleted) deletes dropped directories the same way.

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

"Identical" ignores line endings in text files: a file that differs only by CRLF vs LF counts as identical,
and a line-ending-only edit is not `modified` (see
[Line endings](../troubleshooting.md#line-endings-windows-coreautocrlf)). A file already identical to
upstream (row 2) is never a skip and its record is refreshed, so a degraded install partially heals; the
files that **differ** stay skipped until you `--force` them or restore them yourself.

A seventh outcome is outside the table: a path that is **not a readable regular file** (a directory, an
unreadable file, a symlink at the path or at any parent below your project root; it need not exist, so a
dangling parent symlink or a parent that is a file lands here too) is `unreadable` and skipped, under
`--force` too. A symlink cause names the component (a `.claude/hooks` linked into a dotfiles repo is named as
that directory); other causes give a generic reason. Each write
[replaces the file](../reference/update-advanced.md#writes-replace-the-file).

### The skip labels

- **`modified`**: you changed this file after `pharn` wrote it. This is the label the feature exists for.
- **`unrecorded`**: `pharn` has no record of writing this path, usually a file of your own that collides
  with a path upstream newly added.
- **`unverifiable`**: there is no usable `pharn.records.json` at all, so nothing can be proven about any
  file (see [No usable records store](../reference/update-advanced.md#no-usable-records-store)).
- **`held`**: not a reason of its own: the file would have been written, but it belongs to the
  [executable unit](../reference/update-advanced.md#the-executable-unit-is-upgraded-all-or-none) and
  another file of the unit was skipped.

Skips **exit 0**: a skip is the outcome you asked for, not a failure. `pharn update` never deletes a file it
decides about here; a file upstream no longer ships stays and is listed under `ORPHANED` (see
[Orphaned files](../reference/update-advanced.md#orphaned-files)).

## `--force` and `pharn/.backup/`

`--force` overwrites the `modified`, `unrecorded` and `unverifiable` buckets (never `unreadable`), but every
affected file is first copied, with its relative path preserved, into:

```text
pharn/.backup/<YYYYMMDD-HHMMSS>/
```

The directory is printed when it is created, and again, with a warning that some originals may already be
overwritten or removed, if the update then fails part-way (a directory it cannot delete, a file it cannot
write, a config it cannot save; exit 1). Earlier runs may have left other timestamped directories beside it. It also holds the files saved from
[dropped capabilities](#dropped-capabilities-are-deleted). If **any** backup copy fails, the update aborts
before a single original is touched; a colliding timestamp gets `…-2`, `…-3`. To restore a file:

```bash
cp pharn/.backup/20260807-091500/pharn/CONSTITUTION.md pharn/CONSTITUTION.md
```

**Retention is yours.** `pharn` never prunes `pharn/.backup/`; the `pharn/.backup/` line `init` and `update`
add to your [`.gitignore`](../reference/update-advanced.md#gitignore) keeps it out of git.

## Release channel

An install that follows **releases** (`"ref": "latest"`, `pharn init`'s default) gets the newest pharn-oss
**GitHub release** (a tag created once every required check on its commit passed), at that commit. An
install with no `ref` (made with `--ref main`) gets the tip of `main`.

- **An install on `main` is never moved for you.** Each `update` on it (`--dry-run` too; not with `--ref`
  or `--json`) prints ``Verified releases are now the default for new installs. This install keeps following pharn-oss main; run `pharn update --ref latest` to switch (recorded on first use).``
- **The channel is recorded.** `pharn update --ref latest` writes `"ref": "latest"`, so later `update`, `add`
  and `status` runs follow releases; `pharn update --ref main` removes the key. A switch re-applies even at
  the current version, so it is recorded.
- **No fallback.** When the release cannot be resolved (none published, `api.github.com` unreachable or
  rate-limited), `update` exits 1 before downloading and names `--ref main`. See
  [No verified release could be resolved](../troubleshooting.md#no-verified-release-could-be-resolved).

### An install ahead of its source

`update` never moves your install to an **older** version without being asked. When the version you have
is newer than the source offers, it says so, changes nothing, and exits 0:

- **On `--ref latest`**: the install came from `main` and no release at its version exists yet;
  `--ref main` switches back to `main`.
- **On `main`**: `main` has **moved back** (a revert took its `SKILLS_VERSION` below yours):
  `Your install (skills v2.0.0) is newer than pharn-oss main (v1.0.0) — main has moved back to an older version. Nothing changed.`
  Wait for `main` to move forward.

A `pendingSkillsVersion` counts too. The check runs before the download, so nothing else happens, a
`--ref` switch included (`--json`: `status` `ahead-of-release` / `ahead-of-main`, `plan: null`). `--yes`
does not skip it; `--force` downgrades, backing up your edits. `pharn status` calls such an install
**ahead**, not outdated. A version that is not a plain `X.Y.Z` is never ahead.

## Non-interactive use (CI, scripts, pipes)

`update` confirms before it writes. Off a TTY, without `--yes`, it **exits 1** before any network call,
writing nothing:

```console
$ echo "" | pharn update
■ pharn update needs to confirm before it writes. Run it in an interactive terminal,
  or pass --yes to confirm automatically (e.g. `pharn update --yes`).
$ echo $?
1
```

Pass `--yes` (`-y`; `--yes --force` for the full re-apply). It skips **the confirmation prompt and nothing
else**: the version note and the other notes still print, edits are still skipped, the version still withheld, the exit codes unchanged. It is **not** a drift
check (a run that skips your edits exits 0): use [`pharn status --strict`](status.md) for that. `--force`
does **not** imply `--yes`. ([`pharn init --yes`](init.md#install-without-prompts---yes) never confirms an
overwrite.)

## Before you confirm

`update` downloads and plans **before** it asks, so the question says what the run changes. When it adds
or drops capabilities, a `CAPABILITIES` note lists them first, in the dry run's words:

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

With `--force`, an `OVERWRITE` note then lists every file it will overwrite, grouped by why each needed
`--force`, and `pharn.config.json` when your `models` block is replaced:

```text
◇  OVERWRITE
│    WILL OVERWRITE (--force) — modified
│    pharn/CONSTITUTION.md
│
│    Each is copied to pharn/.backup/<timestamp>/ first (1 file(s)).
```

The question is `Apply this update?` (`Apply this update and overwrite your changes?` with `--force`). When
it deletes a capability directory it says how many (`It deletes 1 capability directory.`) and defaults to
**No**; with nothing to delete it defaults to Yes. Declining exits 0 with nothing written. `--yes` prints the
same notes and skips only the question, so a CI log names what the run changed. The ~2.5 MB download
happens before the question.

## When there is nothing to change

A run whose plan changes nothing does not ask and does not write. "Nothing" means no file to write or
restore, no capability directory to delete, no line to add to `.gitignore` or `.prettierignore`, the same
`pharn.records.json`, and the same `pharn.config.json` apart from `updatedAt` and `pharnVersion` (which
change only on a run that writes something, so `git status` stays clean). It prints its notes (a kept edit
is still listed under `SKIPPED`) and ends with:

- `Nothing to change.` when something is skipped or the recorded version is behind upstream;
- `Up to date.` when nothing is skipped and the recorded version is the one upstream ships.

A missing `commit` (`null`) or a `ref` other than `"latest"` never forces a write by itself; recording a
new `pendingSkillsVersion` does. The dry run ends `Dry run — Up to date.` (or `Nothing to change.`), and
`--json` reports `status` `up-to-date` with `plan: null`.

## The recorded version stays true

A run that skipped anything **does not** advance `skillsVersion` / `commit`: they describe the last
**complete** state, so `pharn status` keeps reporting an update, and the next `pharn update` has work to do. When every skip is an edit of yours (`modified` or `unrecorded`), the
version the run applied is recorded as `pendingSkillsVersion`, and [`pharn add`](add.md) installs at it.
Once the skips are resolved (revert, or `--force`), the version advances; a kept edit keeps the install
showing as outdated, which is the honest report.

## Less common situations

In [update: less common situations](../reference/update-advanced.md):

- Notes a run prints: [the executable unit](../reference/update-advanced.md#the-executable-unit-is-upgraded-all-or-none) (`held`), [orphaned files](../reference/update-advanced.md#orphaned-files) (`ORPHANED`), [the `models` block](../reference/update-advanced.md#the-models-block) (`MODELS`), [a surface pharn-oss does not ship](../reference/update-advanced.md#a-surface-pharn-oss-does-not-ship) (`NOT SHIPPED`), [what is protected by default](../reference/update-advanced.md#what-is-protected-by-default) (`HOOKS`), [the features README at the project root](../reference/update-advanced.md#the-features-readme-at-the-project-root).
- Install states: [when pharn cannot read a capability upstream](../reference/update-advanced.md#when-pharn-cannot-read-a-capability-upstream) (`frozenCapabilities`), [missing files at the same skills version](../reference/update-advanced.md#missing-files-at-the-same-skills-version), [a records store from an interrupted run](../reference/update-advanced.md#a-records-store-from-an-interrupted-run), [no usable records store](../reference/update-advanced.md#no-usable-records-store), [an install recorded at the flat layout](../reference/update-advanced.md#an-install-recorded-at-the-flat-layout).
- Files it touches: [`.gitignore`](../reference/update-advanced.md#gitignore), [`.prettierignore`](../reference/update-advanced.md#prettierignore), [writes replace the file](../reference/update-advanced.md#writes-replace-the-file).
- Refusals: [`pharn is too old for the current pharn-oss`](../troubleshooting.md#pharn-is-too-old-for-the-current-pharn-oss) (`MIN_CLI`).

## Related

[pharn.config.json](../reference/pharn-config.md) (`skillsVersion`, `archetypes`, `capabilities`) ·
[pharn.records.json](../reference/pharn-records.md) (the hash baseline) · [status](status.md) (what has
drifted) · [add](add.md)
