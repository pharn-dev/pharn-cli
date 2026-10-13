# pharn.records.json

A CLI-owned sidecar written next to [`pharn.config.json`](pharn-config.md) at your project root. Its
`files` map holds a sha256 per **install-manifest path** — the PHARN-owned surfaces and selected
capabilities collected by `runInstallArchetype` (`collectExpectedInstallPaths`), not every file `pharn`
writes. [`pharn update`](../commands/update.md) compares against it to tell pharn's bytes from your
edits and refuse to destroy the latter. `pharn.config.json`, this file, and `.claude/settings.json`
are excluded from the map — with one exception that is not a file: `pharn.config.json#/models` records
the `models` block `pharn` wrote **inside** `pharn.config.json` (see
[The `models` block](#the-models-block)).

Source: [`install-records.ts`](../../src/lib/install-records.ts).

**Commit it.** It is part of your project's PHARN state, like `pharn.config.json`. Without a usable
store, `update` skips every **present** file that differs (`unverifiable`) but still **restores**
missing ones; byte-identical files are no-ops and have their records refreshed.

## Shape

```json
{
  "schemaVersion": 1,
  "skillsVersion": "3.0.2",
  "commit": "daa06788…",
  "files": {
    "pharn/CONSTITUTION.md": "e3b0c44298fc1c149afbf4c8996fb924…",
    ".claude/hooks/set-writes-scope.cjs": "9f86d081884c7d659a2feaa0c55ad015…",
    "pharn/pharn-review/n-plus-one/n-plus-one.md": "2c26b46b68ffc68ff99b453c1d304134…"
  }
}
```

| Field           | Type           | Description                                                                  |
| --------------- | -------------- | ---------------------------------------------------------------------------- |
| `schemaVersion` | number         | Matched **exactly**. An unknown value is not guessed at — see below          |
| `skillsVersion` | string         | The `skillsVersion` in `pharn.config.json` when this store was written       |
| `commit`        | string \| null | The `commit` in `pharn.config.json` when this store was written              |
| `files`         | object         | Project-root-relative path → sha256 (lowercase hex) of the bytes that landed |

Hashes are taken from the **written file**, never from the upstream source, so a record cannot
disagree with what is actually on disk. Keys are sorted, so the committed file has a reviewable diff.

## Who writes it

| Command  | Effect                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`   | Writes the full store — every file the install wrote, and the `models` block when it wrote one. A re-run keeps the entries of [orphaned files](#orphaned-files) |
| `add`    | Merges the added capability's files in. Only extends an **already readable** store; it never mints one                                                          |
| `update` | Rewrites it, keyed by the manifest it just applied (see [Pruning](#pruning)), and the `models` record. Keeps the entries of [orphaned files](#orphaned-files)   |
| `remove` | Reads it to decide what to back up, then prunes the removed capability's entries. Never mints one                                                               |

`.claude/settings.json` is **never** recorded: it is yours, and the install only ever creates it when
absent.

[`pharn status`](../commands/status.md#orphaned-files) **reads** it for one thing: to find orphaned
files. Its drift comparison does not use it.

## The `models` block

`pharn.config.json#/models` holds the sha256 of the `models` block `pharn` last wrote into
`pharn.config.json` — the block as `pharn` serializes it (`JSON.stringify`: keys in order, no
whitespace). So re-indenting your config is not an edit, while reordering the block's keys is.
`init` writes it with the block; `update` rewrites it when it writes pharn-oss's block, and carries it
unchanged when it keeps yours; `add` and `remove` carry it untouched. `update` compares your block
against it exactly as it compares a file against its record — see
[update](../commands/update.md#the-models-block). It is only compared, never used as a path, and a
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
  otherwise only read through the guarded orphan check (see [Trust](#trust)) — never used to write.
  Any one of these invalidates the **whole** store rather than
  a single entry, and the reason is reported by name so a fixable JSON error is not mistaken for a
  legacy install;
- **an unknown `schemaVersion`** — a store written by a newer `pharn` is never partially interpreted;
- **stamped for a different state** — `skillsVersion`/`commit` here disagree with `pharn.config.json`.
  Every `pharn` operation writes both files together, so a disagreement means something else changed
  one without the other (typically an older CLI that rewrote the tree while ignoring this file).
  Trusting it would label upstream's bytes as your edits and freeze the install.

In every case the consequence for **present** files that differ is the same and it is the safe
one: `pharn` skips rather than overwrites, and tells you why. **Missing** expected files are still
restored; files already byte-identical to upstream are no-ops. `pharn update --force` backs up and
overwrites the skipped files instead.

## Pruning

Two commands drop entries, and between them the store never describes bytes that are gone.

`update` writes the store as a fresh map keyed by the manifest it just applied. Entries for paths that
are no longer part of your install **and no longer on disk** are dropped rather than accumulating.
Skipped files keep their previous entry, since it still describes what `pharn` wrote there.

### Orphaned files

**A file upstream stopped shipping that is still in your project keeps its entry**, with its old hash,
until you delete it. That entry is what lets `update` and `status` keep listing the file as an
[orphan](../commands/update.md#orphaned-files) — `UNCHANGED` while its bytes still match, `EDITED` once
they do not. Once the file is gone, the next `update` drops the entry. If upstream ships the path
again, the entry makes it a clean upgrade instead of an `unrecorded` skip. The entries of a capability
`update` drops from your config are not kept: those files are named by the membership change, not as
orphans.

**Frozen capabilities are the deliberate exception.** When a capability's upstream definition becomes
unreadable, `update` reports it as `kept-frozen`, leaves its files alone, and — because it is absent
from the manifest that run applied — its records would otherwise be pruned. They are explicitly carried
over instead. Dropping them would make every one of those files `unrecorded` on the next run, forcing a
`--force` to touch a capability nothing was wrong with.

[`remove`](../commands/remove.md) prunes the entries of the capability it removed, at the moment it
removes it, rather than leaving them for the next `update`. It drops every key under that capability's
directory — matched as a **string prefix on the key**, never by walking your filesystem, which is what
lets it clean up correctly even when the directory was already gone. Nothing else in the store is
touched, and the `skillsVersion`/`commit` stamp does not move: `remove` changes neither, so the store
stays stamped for the state it is still in. If the store is absent, unreadable, or stamped for another
state, `remove` leaves the file exactly as it found it — it never mints a store and never rewrites one
it could not verify, the same rule [`add`](../commands/add.md) follows.

Before that delete, `remove` also **reads** the store: a file in the capability directory whose path is
recorded here at its current hash is deleted without a copy, and every other file is first copied to
`.pharn-backup/<timestamp>/`. With no usable store, every file in the directory is copied. See
[What is backed up before the delete](../commands/remove.md#what-is-backed-up-before-the-delete).

## Trust

The file is local but hand-editable, so it is treated as untrusted input: it is parsed defensively,
and a record **key never causes a write or a delete**. `update` iterates its own install manifest and
looks each path up here, so an invented key cannot cause a write. The one place a key becomes a path is
orphan detection, and only for a **read** (an `lstat` and a hash): the key must name a path an install
could have written (`.claude/commands/pharn-*.md`, `.claude/hooks/*.cjs`, a capability directory,
`pharn-contracts/`, `pharn-core/`, the floor directory, a trusted doc, the PHARN license or the features
`README.md`, in either layout), stay inside your project, cross no symlink, and be a regular file. Any
other key is never read and never listed. Editing a
hash to match your own bytes will make `update` treat that file as pharn's and overwrite it — that is
your call to make, and it is the only thing such an edit can do.

## The write lock

`init`, `add`, `remove` and `update` hold a single-writer lock — `.pharn.lock` at the project root,
carrying the holder's pid, host, command and start time — across the write phase, and a second pharn
process refuses instead of interleaving. Without it, two runs can leave this store describing bytes
the other one replaced, **under a matching stamp**, which is precisely the case the stamp cannot
detect. See [troubleshooting](../troubleshooting.md#another-pharn-process-is-running).

The lock is a transient sidecar, not part of the install: it is never in the expected install set,
never in the overwrite-conflict list, and never recorded here — so `pharn status` reports no drift on
it. `list` and `status` neither take it nor are blocked by it.

## Related

- [update](../commands/update.md) — the decision table these hashes drive
- [pharn.config.json](pharn-config.md) — the config this store is stamped against
- [status](../commands/status.md) — the read-only drift report
- [`THREAT-MODEL.md` §4c](../../THREAT-MODEL.md) and [`LIMITS.md` §1b](../../LIMITS.md) — why these
  hashes are **drift baselines, not provenance**: they are taken from the written file, so they detect
  local edits but authenticate nothing about upstream
