# pharn update

Re-fetch the capabilities installed in your project at the latest skills version — **without
destroying anything you have edited**.

```bash
pharn update
pharn update --force   # overwrite your edits too (each file is backed up first)
pharn update --yes     # skip the confirmation prompt (for CI and scripts)
```

`update` compares every PHARN-owned file against the per-file hashes recorded when it was installed
([`pharn.records.json`](../reference/pharn-records.md)). A file whose bytes are exactly what `pharn`
wrote is upgraded. A file it cannot prove is untouched is **skipped and listed**, never overwritten.

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first.
2. Fetches the latest `SKILLS_VERSION` from `pharn-dev/pharn-oss@main` (a lightweight check, no clone)
   and compares it to your recorded `skillsVersion`.
3. If they match, reports "Already up to date" and exits — **unless** you passed `--force`, which
   re-applies upstream at the current version.
4. Otherwise shows the version bump with a pointer to `CHANGELOG.md`, and asks for confirmation —
   unless you passed `--yes`, which skips that one prompt and nothing else.
5. On confirm, clones the repo (SHA-pinned) and **re-resolves your recorded `archetypes`** against the
   latest capability index, then **unions** that result with the capabilities you added by hand.
6. Decides each expected file with the table below, backs up anything `--force` is about to
   overwrite, copies the files it may write, then updates `pharn.records.json` and
   `pharn.config.json`.

Because `update` re-resolves your archetypes against the latest index, a capability upstream added for
one of your archetypes since your last install is picked up, and one it removed is dropped — your
`archetypes` list itself is never changed.

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

If nothing changed, nothing is printed. Removed entries' **files are left on disk** — `update` never
deletes.

> **Named limit — removals are not permanent.** `pharn remove` drops the entry from `capabilities`;
> it does not record a tombstone. If your archetypes still select that capability, the next `update`
> re-adds it — but it will now **say so** under `ADDED`, instead of resurrecting it in silence.
> `pharn remove` warns you about this at removal time for an `auto` capability.

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

A file that is already byte-identical to upstream (row 2) is never a skip, even with no records — and
its record is refreshed, so a degraded install partially heals itself. Partially: it never recovers
records for the files that **differ**, which is exactly the set an upgrade needs to touch. Those stay
skipped until you `--force` them or restore them yourself.

There is a seventh outcome the table cannot cause: a path that exists but is **not a readable regular
file** (a directory where a file belongs, an unreadable file, a symlink) is reported as `unreadable`
and skipped — including under `--force`.

### The three skip labels

- **`modified`** — you changed this file after `pharn` wrote it. This is the label the feature exists
  for.
- **`unrecorded`** — `pharn` has no record of writing this path. Usually a file of your own that
  collides with a path upstream newly added, or a file installed before records existed.
- **`unverifiable`** — there is no usable `pharn.records.json` at all, so nothing can be proven about
  any file. Every install created before `pharn` 0.4.0 starts here (see
  [First update after upgrading](#first-update-after-upgrading)).

Skips **exit 0**. A skip is the outcome you asked for, not a failure. `pharn update` also never
**deletes**: a file upstream no longer ships stays exactly where it is.

## `--force` and `.pharn-backup/`

`--force` overwrites all three skip buckets — but every affected file is first copied, with its
relative path preserved, into:

```text
.pharn-backup/<YYYYMMDD-HHMMSS>/
```

The directory is printed when it is created. If **any** backup copy fails, the update aborts before a
single original is touched. A colliding timestamp directory is never written into — the run
uniquifies (`…-2`, `…-3`) instead, so a second `--force` in the same second cannot overwrite the only
surviving copy of your edits.

To restore a file, copy it back:

```bash
cp .pharn-backup/20260807-091500/CONSTITUTION.md CONSTITUTION.md
```

**Retention is yours.** `pharn` never prunes `.pharn-backup/` and never edits your `.gitignore` — so
backups accumulate and are committable by accident. Delete them once you are happy, or add
`.pharn-backup/` to your `.gitignore`.

## Non-interactive use (CI, scripts, pipes)

`update` confirms before it writes, so it needs either a terminal or your explicit consent. Off a TTY —
in CI, a pipe, or any script — it **exits 1** with a usage error rather than rendering a prompt nobody
can answer:

```console
$ echo "" | pharn update
▲ pharn update needs to confirm before it writes. Run it in an interactive terminal,
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

> [`pharn init`](init.md) has no `--yes` and is interactive-only — see its note for why.

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

## Layout migrations

`update` records the layout of the clone it actually copied from, so `pharn.config.json` can no longer
disagree with where your files are. If your project was installed with the old flat layout and
upstream has since moved to `pharn/`, the update installs the `pharn/` tree — and, because `update`
never deletes, the old top-level copies remain. They are no longer managed by `pharn` (no command
addresses them any more), so delete them by hand; the update prints a warning when this happens.

## What is protected by default

- `.claude/settings.json` — your Claude Code configuration. `init` writes it only when absent; `update`
  **never** touches it at all (not even with `--force` — it is not in the install manifest).
- `CONSTITUTION.md` — protected like every other manifest path: if you have edited it, it is a `modified`
  skip by default. `--force` overwrites it too, after copying the current bytes to `.pharn-backup/`.
  (Before 0.4.0 `update` silently overwrote a hand-edited constitution despite docs claiming otherwise —
  that is fixed.)

## Related

- [pharn.config.json](../reference/pharn-config.md) — `skillsVersion`, `archetypes`, `capabilities`
- [pharn.records.json](../reference/pharn-records.md) — the per-file hash baseline this command reads
- [status](status.md) — the read-only report of what has drifted
- [add](add.md)
