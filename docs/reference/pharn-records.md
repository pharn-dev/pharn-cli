# pharn.records.json

A CLI-owned sidecar written next to [`pharn.config.json`](pharn-config.md) at your project root. Its
`files` map holds a sha256 per **install-manifest path** — the PHARN-owned surfaces and selected
capabilities an install expects (what the fetched `pharn-install.json` declares, plus your selection), not
every file `pharn` writes. [`pharn update`](../commands/update.md) compares against it to tell pharn's bytes from your
edits and refuse to destroy the latter. `pharn.config.json` and this file are excluded from the map.
Two entries are not install-manifest paths: `pharn.config.json#/models`, which is not a file — it
records the `models` block `pharn` wrote **inside** `pharn.config.json` (see
[The `models` block](#the-models-block)) — and `.claude/settings.json`, only when `init` created it (see
[`.claude/settings.json`](#claudesettingsjson)).

**Commit it.** It is part of your project's PHARN state, like `pharn.config.json`. Without a usable
store, `update` skips every **present** file that differs (`unverifiable`) but still **restores**
missing ones; files identical to upstream are no-ops and have their records refreshed.

## Shape

Five of the 546 entries the store held after the run that wrote the
[`pharn.config.json` example](pharn-config.md#example) (`pharn init --yes`, then `pharn add n-plus-one`,
`pharn` 0.21.0, pharn-oss v7.22.0), hashes shortened to `…`. Keys are sorted.

```json
{
  "schemaVersion": 1,
  "skillsVersion": "7.22.0",
  "commit": "9422b97f9bcef022d240822024e75a1a49c6e278",
  "files": {
    ".claude/hooks/set-writes-scope.cjs": "668a9b0154c341a98a9f73a1ab0fe98e…",
    ".claude/settings.json": "d218f551515df41482b8a18885b76ee8…",
    "pharn.config.json#/models": "da4baeb9b1ed1c7e0f06bfd6b4f79dcf…",
    "pharn/CONSTITUTION.md": "8f0c7cad7d2c7350da2bcb1674509f2a…",
    "pharn/pharn-review/n-plus-one/n-plus-one.md": "5149e3524a2aa5c78407787c41341b84…"
  }
}
```

| Field           | Type           | Description                                                                               |
| --------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `schemaVersion` | number         | Matched **exactly**. An unknown value is not guessed at — see below                       |
| `skillsVersion` | string         | The `skillsVersion` in `pharn.config.json` when this store was written (never a gate)     |
| `commit`        | string \| null | The `commit` in `pharn.config.json` when this store was written (never a gate)            |
| `files`         | object         | Project-root-relative path → content hash (lowercase sha256 hex) of the bytes that landed |
| `incoming`      | object         | Optional, usually absent. The hashes an `update` is about to copy — see below             |

Hashes are taken from the **written file**, never from the upstream source, so a record cannot
disagree with what is actually on disk.

`incoming` exists only while an `update` is copying files. Before its first copy, `update` writes the
store with the hash of every file it is about to write under `incoming`, and its closing write drops the
map. If the run is interrupted between the two (Ctrl-C, a crash), the next `update` treats a file whose
current hash equals its `incoming` hash as written by `pharn`, so a plain re-run finishes the update even
after another upstream release (see
[A records store from an interrupted run](update-advanced.md#a-records-store-from-an-interrupted-run)).
A malformed `incoming` is ignored, never an error: the files it names then read as `modified`. `pharn`
0.21.2 and older ignore the key. Keys are sorted, so the committed file has a reviewable diff.

The hash is a sha256 that ignores line endings in text files: before hashing, each `\r\n` in a file
whose first 8000 bytes contain no NUL byte is turned into `\n` (a lone `\r` is kept, and a binary
file is hashed as it is). So a project checked out with `core.autocrlf=true` still matches its
records, and a change that only swaps line endings is not seen as an edit. For a file with no `\r\n`
this is the plain sha256 of its bytes, so stores written by earlier versions stay valid. See
[Line endings](../troubleshooting.md#line-endings-windows-coreautocrlf).

## Who writes it

| Command     | Effect                                                                                                                                                                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`      | Writes the full store — every file the install wrote, the `models` block when it wrote one, and `.claude/settings.json` when it created it. A re-run keeps the entries of [orphaned files](#orphaned-files), and reads the replaced store to decide what to back up before deleting a dropped capability's directory |
| `add`       | Merges the added capability's files in. Only extends an **already readable** store; it never mints one                                                                                                                                                                                                               |
| `update`    | Writes it once with `incoming` before copying, then rewrites it, keyed by the manifest it just applied (see [Pruning](#pruning)), and the `models` record. Keeps the entries of [orphaned files](#orphaned-files). Reads it first to decide what to back up before deleting a dropped capability's directory         |
| `remove`    | Reads it to decide what to back up, then prunes the removed capability's entries. Never mints one                                                                                                                                                                                                                    |
| `uninstall` | Reads it to decide what it may delete, then deletes it (after the files it proved, before the config)                                                                                                                                                                                                                |

[`pharn status`](../commands/status.md#orphaned-files) **reads** it for one thing: to find orphaned
files. Its drift comparison does not use it.

## `.claude/settings.json`

The install only ever creates `.claude/settings.json` when your project has none — it copies pharn-oss's
verbatim — and never writes it again. When a fresh `init` created it, its hash is recorded under
`.claude/settings.json`, so [`pharn uninstall`](../commands/uninstall.md) can delete it while it still
matches, and keep it (listed) once you have changed it. A `settings.json` that existed before `init` is
**never** recorded: it is yours.

- A re-run `init`, which now preserves the file, keeps the record. `update` keeps it too, and `add` and
  `remove` leave it alone. None of them writes the file.
- `init` and `update` keep the record only while something is at that path. If you delete the file,
  `pharn` does not put it back, and the next `update` drops the record — an already-current install
  included: that run is not "up to date", it re-applies once, copying no file and rewriting
  `pharn.records.json` without the record. The run after it changes nothing.
- It is never an [orphan](#orphaned-files) and never gets a `.prettierignore` line: it is not one of the
  install paths.
- A store written before this change has no such entry, so `uninstall` leaves the file, as it always did.

## The `models` block

`pharn.config.json#/models` holds the sha256 of the `models` block `pharn` last wrote into
`pharn.config.json` — the block as `pharn` serializes it (`JSON.stringify`: keys in order, no
whitespace). So re-indenting your config is not an edit, while reordering the block's keys is.
`init` writes it with the block; `update` rewrites it when it writes pharn-oss's block, and carries it
unchanged when it keeps yours; `add` and `remove` carry it untouched. `update` compares your block
against it exactly as it compares a file against its record — see
[update](update-advanced.md#the-models-block). It is only compared, never used as a path, and a
store without it reads the block as `unrecorded`.

## When the store is ignored (fail-closed)

`update` treats the store as **unavailable** — and therefore skips every **present** file that
differs from upstream, labelling them `unverifiable` — whenever it is:

- **absent** (an install created before `pharn` 0.4.0);
- **unreadable or malformed** — not a regular file (a directory, a FIFO or a device) or larger than
  16 MiB, invalid JSON, not an object, a missing `files` object, a non-sha256 hash, or a path key
  that is empty, absolute, or has a `..` or `.` path **segment**. The key rule is a segment rule,
  not a substring ban: an ordinary filename that merely _contains_ `..`, such as
  `migration..v2.md`, is valid, because a key here is compared against the install manifest and
  otherwise only read through the guarded orphan check (see [Trust](#trust)) — never used to write;
  [`uninstall`](#uninstall) alone deletes by key, under the same guard.
  Any one of these invalidates the **whole** store rather than
  a single entry, and the reason is reported by name so a fixable JSON error is not mistaken for a
  legacy install;
- **an unknown `schemaVersion`** — a store written by a newer `pharn` is never partially interpreted.

In every case the consequence for **present** files that differ is the same and it is the safe
one: `pharn` skips rather than overwrites, and tells you why. **Missing** expected files are still
restored; files already identical to upstream are no-ops. `pharn update --force` backs up and
overwrites the skipped files instead.

## The stamp is not a gate

`skillsVersion` and `commit` record the config's values when the store was written. They help when you
read the file, but no command compares them with `pharn.config.json` before using the store. A path
whose current hash equals its recorded hash holds bytes `pharn` wrote, whatever version the store was
written for — and that is the only thing the [update table](../commands/update.md) needs.

So a store from an interrupted `pharn add` or `pharn update` (each writes this file before the
config, so a failure between the two leaves it stamped for a state the config never reached) is used
as it is: on the next upstream release your unedited files upgrade, your edited ones are skipped as
`modified`, and no `--force` is needed. Every overwrite and every delete still requires the file's
hash to equal its record. Two edge cases follow from that:

- **A store left by an older `pharn`** that rewrote the tree while ignoring this file still holds the
  hashes of the bytes that older install wrote. A file upstream has since changed then reads as
  `modified` instead of `unverifiable` — a different label, the same outcome: it is skipped.
- **A file you reverted on purpose** to bytes such a store recorded matches its record, so `update`
  upgrades it like any other file `pharn` wrote.

## Pruning

Two commands drop entries, and between them the store never describes bytes that are gone.

`update` writes the store as a fresh map keyed by the manifest it just applied. Entries for paths that
are no longer part of your install **and no longer on disk** are dropped rather than accumulating.
Skipped files keep their previous entry, since it still describes what `pharn` wrote there.

### Orphaned files

**A file upstream stopped shipping that is still in your project keeps its entry**, with its old hash,
until you delete it. That entry is what lets `update` and `status` keep listing the file as an
[orphan](update-advanced.md#orphaned-files) — `UNCHANGED` while its bytes still match, `EDITED` once
they do not. Once the file is gone, the next `update` drops the entry. If upstream ships the path
again, the entry makes it a clean upgrade instead of an `unrecorded` skip. The entries of a capability
`update` drops from your config are not kept: those files are named by the membership change, not as
orphans, and their directory is deleted. Before that delete, `update` reads the store the way `remove`
does (below): a file at its recorded hash is not backed up, every other file is.

**Frozen capabilities are the deliberate exception.** When a capability's upstream definition becomes
unreadable, `update` reports it as `kept-frozen`, leaves its files alone, and — because it is absent
from the manifest that run applied — its records would otherwise be pruned. They are explicitly carried
over instead. Dropping them would make every one of those files `unrecorded` on the next run, forcing a
`--force` to touch a capability nothing was wrong with.

[`remove`](../commands/remove.md) prunes the entries of the capability it removed, at the moment it
removes it, rather than leaving them for the next `update`. It drops every key under that capability's
directory — matched as a **string prefix on the key**, never by walking your filesystem, which is what
lets it clean up correctly even when the directory was already gone. Nothing else in the store is
touched, and the `skillsVersion`/`commit` stamp is written with the values `pharn.config.json` holds:
`remove` changes neither. If the store is absent or unreadable, `remove` leaves the file exactly as it
found it — it never mints a store and never rewrites one
it could not verify, the same rule [`add`](../commands/add.md) follows.

Before that delete, `remove` also **reads** the store: a file in the capability directory whose path is
recorded here at its current hash is deleted without a copy, and every other file is first copied to
`pharn/.backup/<timestamp>/`. With no usable store, every file in the directory is copied. See
[What is backed up before the delete](../commands/remove.md#what-is-backed-up-before-the-delete).

## Uninstall

[`uninstall`](../commands/uninstall.md) has no clone and so no install manifest: this store is its
**only** proof of what `pharn` wrote. It deletes a recorded file only when the key is a path an install
writes at either layout (`pharn/` or the legacy root one, so a recorded copy an older install left at the
root is covered), the file is a regular file reached without a symlinked directory, and
its bytes still match the recorded hash. Every other key is left alone — an edited file is kept and
listed, and a key outside `pharn`'s install paths is never deleted whatever its hash says — except
`.claude/settings.json`, admitted by name when `init` recorded it (see
[`.claude/settings.json`](#claudesettingsjson)) and then checked the same way. With no
usable store (absent or corrupt) `uninstall` refuses and deletes nothing; a store written for another
`skillsVersion`/`commit` is still usable, since only a file whose hash equals its record is deleted.
The store itself is deleted after the files, before `pharn.config.json`. Every delete `pharn` makes is
listed in [What PHARN deletes](deletes.md).

## Trust

The file is local but hand-editable, so it is treated as untrusted input: it is parsed defensively,
and a record **key never causes a write**, and causes a delete only in `uninstall` (below). `update` iterates its own install manifest and
looks each path up here, so an invented key cannot cause a write. The one place a key becomes a path is
orphan detection, and only for a **read** (an `lstat` and a hash): the key must name a path an install
could have written (`.claude/commands/pharn-*.md`, `.claude/hooks/*.cjs` or `*.mjs`, a capability directory,
`pharn-contracts/`, `pharn-core/`, the floor directory, a trusted doc, the PHARN license or the features
`README.md`, in either layout), stay inside your project, cross no symlink, and be a regular file. Any
other key is never read and never listed. Editing a
hash to match your own bytes will make `update` treat that file as pharn's and overwrite it — that is
your call to make, and it is the only thing such an edit can do.

`uninstall` is the one command that turns a key into a **delete**, under the same guard as orphan
detection: the key must name a path an install could have written, stay inside your project, cross no
symlinked directory, and be a regular file whose bytes still match the record (an invented `src/app.ts`
key is never touched, whatever its hash). Within those paths, a hash edited to match your own bytes lets
`uninstall` delete that file — again your call, and again the only thing the edit can do.

## The write lock

`init`, `add`, `remove`, `update` and `uninstall` hold a single-writer lock — `pharn/.lock` (inside `pharn/`),
carrying the holder's pid, host, command and start time — across the write phase, and a second pharn
process refuses instead of interleaving. Without it, two runs can leave this store describing bytes
the other one replaced, with nothing in the store to show it (the stamp is not a check). See [troubleshooting](../troubleshooting.md#another-pharn-process-is-running).

The lock is a transient sidecar, not part of the install: it is never in the expected install set,
never in the overwrite-conflict list, and never recorded here — so `pharn status` reports no drift on
it. `list` and `status` neither take it nor are blocked by it.

## Related

- [update](../commands/update.md) — the decision table these hashes drive
- [pharn.config.json](pharn-config.md) — the config whose `skillsVersion`/`commit` this store records
- [status](../commands/status.md) — the read-only drift report
- [`THREAT-MODEL.md` §4c](../../THREAT-MODEL.md) and [`LIMITS.md` §1b](../../LIMITS.md) — why these
  hashes are **drift baselines, not provenance**: they are taken from the written file, so they detect
  local edits but authenticate nothing about upstream
