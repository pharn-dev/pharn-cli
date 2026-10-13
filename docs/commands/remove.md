# pharn remove

Remove a single installed **capability** — a griller or a lens — from an existing project (one with a
`pharn.config.json`). The inverse of [`add`](add.md): it deletes exactly that capability's directory and
drops its entry from `pharn.config.json`. Any file in that directory that `pharn` cannot prove it wrote
unchanged is copied to `.pharn-backup/<timestamp>/` first — see
[What is backed up before the delete](#what-is-backed-up-before-the-delete).

```bash
pharn remove <name>          # e.g. pharn remove a11y
pharn remove <role>:<name>   # e.g. pharn remove lens:n-plus-one
pharn remove                 # no arg, in a terminal: interactive multi-select picker
```

`rm` is accepted as an alias for `remove`.

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first.
2. With no argument **in a terminal**, opens an interactive multi-select picker (grouped by role) over
   the capabilities you have installed, then asks for one confirmation listing your picks. With an
   argument, resolves it to one installed capability. In a non-interactive context (CI, a pipe),
   no-argument `pharn remove` does **not** prompt — it exits with a usage error (unless nothing is
   installed, which is reported plainly).
3. Backs up every file in the selected directories that is not provably `pharn`'s own, unchanged bytes
   (see [below](#what-is-backed-up-before-the-delete)), then deletes each selected capability's
   isolated directory and drops its entry from `capabilities`.
4. Prunes that capability's entries from [`pharn.records.json`](../reference/pharn-records.md), so the
   store never describes files that are gone.

Removal needs **no network and no clone** — everything is derivable from `capabilities` plus your
filesystem. `CONSTITUTION.md`, `memory-bank/`, and your detected `archetypes` are **never** touched.

## The capability argument

Each capability lives in its own directory, addressed at your project's recorded layout — flat
(`pharn-review/<name>` for a lens, `pharn-pipeline/grillers/<name>` for a griller) or the same paths
under `pharn/`. Removal is therefore precise; siblings are never touched.

- **Not installed** → a no-op (nothing is written); the CLI lists the capabilities you actually have as
  the valid values.
- **Ambiguous** (a name installed in both roles, given without a role) → the CLI asks you to
  disambiguate with `griller:` / `lens:`.
- Already-deleted directory → treated as done (idempotent).

`remove` takes **no options at all**. `--yes` / `-y` is an [`update`](update.md) flag, and
`pharn remove --yes` is **refused** (exit 1) rather than accepted and ignored. There is nothing here
for it to skip: the named form above deletes without asking, and the picker's one confirmation is the
destructive gate itself — it is always shown, it lists exactly what will be deleted, and it defaults
to **No**.

> Earlier releases accepted `pharn remove --yes` and silently dropped it. See
> [Unsupported option for this command](../troubleshooting.md#unsupported-option-for-this-command).

## What is backed up before the delete

A capability directory can hold more than `pharn` put there — notes you added, or an edit to a persona
file. Before deleting anything, `remove` checks every regular file in each directory it is about to
delete against [`pharn.records.json`](../reference/pharn-records.md):

- A file whose path is recorded **and** whose bytes still match the recorded hash is `pharn`'s own,
  unchanged — it is deleted without a copy (the next install can write it again).
- **Every other file is copied first**: a file you added, a recorded file you edited, and — when the
  store is absent, unreadable, or stamped for a different install state — every file in the directory,
  because then nothing can be proven.

The copies go to `.pharn-backup/<timestamp>/` at your project root — the same backup directory
[`pharn update --force`](update.md) and [`pharn add`](add.md) write — preserving each file's
project-relative path, and the directory is printed as soon as it exists:

```text
Backed up 1 file(s) to .pharn-backup/20261013-141530 before removing.
```

When nothing needs saving (every file is recorded and unchanged, or the directory was already gone), no
backup directory is created. The picker makes **one** backup for its whole selection, after you confirm
and before the first delete. The backup copies everything that qualifies, however large — if you keep
big generated files inside a capability directory, they are copied too.

If the backup cannot be made — `.pharn-backup` is a symlink, a file or folder in the directory cannot be
read, a copy fails — `remove` **refuses with exit 1 and deletes nothing**: no directory, no config
change, no records change. A partly written `.pharn-backup/<timestamp>/` may be left behind; your
originals are untouched. Fix the cause (see
[`--force` aborted with a backup error](../troubleshooting.md#--force-aborted-with-a-backup-error)) and
re-run.

**Not backed up:** entries that are not regular files. A **symbolic link** inside the directory is
deleted as a link and never followed — whatever it points at is left exactly as it was, and the link
itself is not saved. A FIFO, socket or device file is skipped and deleted the same way.

## Concurrency

`remove` takes the project lock (`.pharn.lock`) around its backup → delete → prune → config write — on the
named path, and on the picker path after its one confirmation. A second `pharn` writer refuses with a
named message and exit 1. Worth knowing because `remove` is otherwise entirely local: it makes no
network call and clones nothing, so a refusal is the one thing that can stop it for a reason outside
your project. See
[Another pharn process is running](../troubleshooting.md#another-pharn-process-is-running).

## The record store

Removing a capability also drops its entries from [`pharn.records.json`](../reference/pharn-records.md)
— the sidecar recording a hash per file `pharn` wrote — so nothing in it describes bytes that no longer
exist. Every other entry, and the store's `skillsVersion`/`commit` stamp, is left exactly as it was:
`remove` changes neither version nor commit. If the store is absent, unreadable, or stamped for a
different install state, `remove` leaves the file untouched rather than minting or rewriting one it
cannot verify — the same rule [`add`](add.md) follows. The removal itself proceeds either way.

## Removing an auto-selected capability

If the entry's recorded `source` is `auto` — it was selected for your archetypes by
[`init`](init.md) or a prior [`update`](update.md) — `remove` prints a warning that it comes back:
[`pharn update`](update.md) **will** reinstall it (and name it in its report) the next time it
re-applies your install, because every such run re-resolves your archetypes. Removing a `manual` entry
(one you added with [`add`](add.md)) warns nothing.

That is not necessarily the very next `update`. At the skills version you already have, `update` stops
at "Already up to date" without fetching the capability index, and nothing left in your project says
the capability is missing — `remove` dropped both its config entry and its records — so a same-version
run leaves it removed. It comes back with the first run that re-applies the install: at the latest the
one that moves to a new pharn-oss version, or right away with `pharn update --force` (which also
overwrites files you edited, after backing them up — see
[`--force`](update.md#--force-and-pharn-backup)).

The warning asserts "will", not "may", because it is derived from the stored `source` alone — `remove`
makes no network call and cannot re-resolve. The next section is why that is a heuristic rather than a
guarantee.

**Silence is not a promise that the removal is permanent.** `update` writes
`resolve(archetypes) ∪ manual`; dropping the entry removes it from the _manual_ half, but the
_resolved_ half is unaffected. If your archetypes still select that capability — and most capabilities
are `universal`, so they usually do — the next `update` may re-add it as `auto` and name it under
`ADDED`. `remove` cannot warn about this: it has no capability index and never fetches one, so it
cannot know whether your archetypes select the thing you are removing. To keep a capability out for
good, remove the archetype that selects it.

The warning is derived from the stored field alone, so `remove` stays offline. An entry whose `source`
is **absent** (a config predating the field) warns nothing — its provenance is genuinely unknown until
the next `update` infers it, and a wrong warning would be worse than none. See
[`capabilities[].source`](../reference/pharn-config.md#capabilitiessource--selection-provenance).

## Related

- [add](add.md)
- [list](list.md)
- [pharn.config.json](../reference/pharn-config.md)
