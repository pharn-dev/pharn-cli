# What PHARN deletes

This page is the one list of everything `pharn` deletes, with the check that stands behind each delete.
The command pages link here instead of restating it. Anything not listed under
[In your project](#in-your-project) or [pharn's own state](#pharns-own-state) is never deleted by any
`pharn` command.

## In your project

### A capability dropped from the config: `pharn update` and a re-run `pharn init`

The directory of each capability that leaves `pharn.config.json`, because your archetypes no longer
select it or upstream no longer ships it (for example `pharn/pharn-pipeline/grillers/<name>/`). It is
deleted because PHARN's commands run whatever capability directories are on disk, so a dropped one would
keep running.

- Only the one directory of a capability your config lists, addressed by its validated name as a strict
  child of its role directory. Siblings are never touched.
- Refused, with nothing changed, when the path to it crosses a symbolic link (checked when the run plans
  and again at the delete) or when a file in it cannot be read.
- Every file in it that `pharn` cannot prove it wrote unchanged is copied to `pharn/.backup/<timestamp>/`
  first: a file with no record, a file whose bytes differ from its record, or every file when there is
  no usable [`pharn.records.json`](pharn-records.md).
- Shown beforehand: `--dry-run` lists it under `WOULD DELETE`, and the confirm names it and defaults to
  No. `pharn update --yes` skips that confirm; `pharn init --yes` refuses any re-install, so it never
  deletes.

Details: [`update`](../commands/update.md#dropped-capabilities-are-deleted) and
[`init`](../commands/init.md#dropped-capabilities-are-deleted).

### The capability you remove: `pharn remove`

The one capability directory you name (or pick), by the same address rule, the same symbolic-link
refusal and the same backup rule as above. Then its entries are pruned from `pharn.records.json` and its
entry from `pharn.config.json`. Details: [`remove`](../commands/remove.md).

### The files pharn proves it wrote: `pharn uninstall`

- Each file recorded in `pharn.records.json` whose path is one an install writes, that is a regular
  file reached without a symbolic-linked directory, and whose bytes still equal its record. This
  includes [orphans](../commands/update.md#orphaned-files) and `.claude/settings.json` when a fresh
  `pharn init` created it.
- Then each directory those deletes left empty, deepest first, never the project root (a non-recursive
  delete, so a directory that still holds anything stays).
- Then `pharn.records.json`, then `pharn.config.json` after it is copied to `pharn/.backup/<timestamp>/`.
- Last, `pharn/` itself, but only if it is empty.

Details: [`uninstall`](../commands/uninstall.md#what-is-deleted).

### Record entries, never files

`pharn update` writes `pharn.records.json` as a fresh map of the install it just applied, so the entry
of a file that is no longer part of your install and no longer on disk is dropped. `pharn remove` drops
the entries under the directory it removed. No file is touched. See
[Pruning](pharn-records.md#pruning).

## pharn's own state

- **The download.** Each command that fetches pharn-oss extracts it into a new directory under your
  system's temp directory and deletes it when the command ends, when the download is refused or fails,
  on exit, and on `SIGINT`/`SIGTERM`.
- **`pharn/.lock`.** The command that took the lock deletes it when it ends (also on `SIGINT`/`SIGTERM`),
  and only when the lock still names that run. A lock judged stale is moved to
  `pharn/.lock.<pid>.<hex>`, checked and deleted by the run that moved it; a file of that name that a
  killed run left behind is never deleted. See
  [If the lock outlives its owner](../troubleshooting.md#if-the-lock-outlives-its-owner).
- **An empty `pharn/` the lock created.** When `pharn/` did not exist, the lock creates it and deletes it
  again if it is still empty when the lock is released.
- **A write's temp file.** A file `pharn` replaces is first written to `<file>.<pid>.<nonce>.tmp` beside
  it and renamed over it; that temp file is deleted when the write fails before the rename.

## Overwrites are not deletes

Replacing a file's bytes (an upgrade in `pharn update`, `update --force`, `pharn add`, an overwrite a
`pharn init` re-run confirms) is a write, not a delete. Whatever `pharn` cannot prove it wrote unchanged
is copied to `pharn/.backup/<timestamp>/` before it is replaced, and an existing `.claude/settings.json`
is never overwritten.

## What is never deleted

- **A file with no record**, and **a recorded file you changed**, anywhere outside a capability directory
  that `remove` deletes or that `update`/`init` drops. Inside one, such a file is backed up first and then
  deleted with the directory.
- **Orphans** (files upstream stopped shipping, including the top-level copies a `flat` install left and
  a root `THREAT-MODEL.md` or `LIMITS.md` from a pharn-oss older than 7.0.0). `update`, `init`, `add` and
  `status` never delete one by itself; only a capability directory deleted as above takes the ones
  inside it. `uninstall` deletes the ones still equal to their record.
- **`.claude/settings.json`**, except by `uninstall` when a fresh `pharn init` created it and it still
  equals its record. A `settings.json` that existed before `init` is never recorded.
- **`.claude/settings.local.json`.**
- **Every `pharn/.backup/` directory**, including the one a run creates.
- **Your data:** `pharn/features/<feature>/` work, `memory-bank/`, `pharn.spec-template.md`, an old
  `.pharn/` and an old root `.pharn-backup/` directory.
- **The lines `pharn` added to `.gitignore` and `.prettierignore`.** Those files are only appended to.
- **Anything behind a symbolic link.** A delete whose path crosses a symbolic-linked directory refuses
  the whole run instead.
- **A `pharn/.lock` that is a directory**, or a lock a live run holds.
