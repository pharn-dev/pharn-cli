# pharn.records.json

A CLI-owned sidecar written next to [`pharn.config.json`](pharn-config.md) at your project root. Its
`files` map holds a sha256 per **install-manifest path** — the PHARN-owned surfaces and selected
capabilities collected by `runInstallArchetype` (`collectExpectedInstallPaths`), not every file `pharn`
writes. [`pharn update`](../commands/update.md) compares against it to tell pharn's bytes from your
edits and refuse to destroy the latter. `pharn.config.json`, this file, and `.claude/settings.json`
are excluded from the map.

Source: [`install-records.ts`](../../src/lib/install-records.ts).

**Commit it.** It is part of your project's PHARN state, like `pharn.config.json`. Without a usable
store, `update` skips every **present** file that differs (`unverifiable`) but still **restores**
missing ones; byte-identical files are no-ops and have their records refreshed.

## Shape

```json
{
  "schemaVersion": 1,
  "skillsVersion": "1.2.0",
  "commit": "daa06788…",
  "files": {
    "CONSTITUTION.md": "e3b0c44298fc1c149afbf4c8996fb924…",
    ".claude/hooks/set-writes-scope.cjs": "9f86d081884c7d659a2feaa0c55ad015…",
    "pharn-review/n-plus-one/n-plus-one.md": "2c26b46b68ffc68ff99b453c1d304134…"
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

| Command  | Effect                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ |
| `init`   | Writes the full store — every file the install wrote                                                   |
| `add`    | Merges the added capability's files in. Only extends an **already readable** store; it never mints one |
| `update` | Rewrites it, keyed by the manifest it just applied (see [Pruning](#pruning))                           |
| `remove` | Does not touch it — the removed capability's entries are pruned by the next `update`                   |

`.claude/settings.json` is **never** recorded: it is yours, and the install only ever creates it when
absent.

## When the store is ignored (fail-closed)

`update` treats the store as **unavailable** — and therefore skips every **present** file that
differs from upstream, labelling them `unverifiable` — whenever it is:

- **absent** (an install created before `pharn` 0.4.0);
- **unreadable or malformed** — invalid JSON, not an object, a missing `files` object, a non-sha256
  hash, or a path key that is absolute or contains `..`. Any one of these invalidates the **whole**
  store rather than a single entry, and the reason is reported by name so a fixable JSON error is not
  mistaken for a legacy install;
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

`update` writes the store as a fresh map keyed by the manifest it just applied. Entries for paths that
are no longer part of your install — a removed capability, or a file dropped upstream — are dropped
rather than accumulating. Skipped files keep their previous entry, since it still describes what
`pharn` wrote there.

## Trust

The file is local but hand-editable, so it is treated as untrusted input: it is parsed defensively,
and a record **key is never used to build a filesystem path**. `update` iterates its own install
manifest and looks each path up here, so an invented key cannot cause a read or a write. Editing a
hash to match your own bytes will make `update` treat that file as pharn's and overwrite it — that is
your call to make, and it is the only thing such an edit can do.

## Related

- [update](../commands/update.md) — the decision table these hashes drive
- [pharn.config.json](pharn-config.md) — the config this store is stamped against
- [status](../commands/status.md) — the read-only drift report
