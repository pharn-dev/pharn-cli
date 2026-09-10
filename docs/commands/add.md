# pharn add

Add a single PHARN **capability** — a griller or a lens — to an existing project (one with a
`pharn.config.json`). This is a manual override of the archetype auto-selection [`init`](init.md)
performs.

```bash
pharn add <name>          # e.g. pharn add a11y
pharn add <role>:<name>   # e.g. pharn add lens:n-plus-one (role disambiguates)
pharn add                 # no arg, in a terminal: interactive multi-select picker
```

## Behavior

1. Reads `pharn.config.json`. If none exists — or it is a pre-archetype (module) config — it exits with
   a hint to run `pharn init` first. A config that exists but is **invalid** (a bad `models`/`seam`
   block, an out-of-enum `capabilities[].source`, unparseable JSON) is reported by its own named error
   and exits 1 — deliberately not the "run `pharn init`" hint, which would tell you to overwrite it.
2. Takes the project lock (`.pharn.lock`) — **before** any download, so a run that will be refused pays
   for no network — warns if a proxy is configured, then clones `pharn-dev/pharn-oss` (SHA-pinned).
3. **Checks the CLI floor.** If the clone declares a `MIN_CLI` newer than your CLI, `add` refuses here.
4. **Checks the version.** If the clone's `SKILLS_VERSION` does not match the `skillsVersion` recorded
   in your `pharn.config.json`, `add` **refuses** — see [Version mismatch](#version-mismatch) below.
5. **Checks the layout.** If the clone's install layout does not match the `layout` recorded in your
   `pharn.config.json`, `add` **refuses** — see [Layout mismatch](#layout-mismatch) below.
6. **Reads the capability index** from the clone — after all three gates, which is why a refusal never
   depends on parsing it, and why a refused run never renders the picker.
7. Resolves your argument against that index. If it uniquely names a capability you don't already have,
   it **backs up any destination file it is about to overwrite with different bytes** (see
   [Overwrite protection](#overwrite-protection) below), then copies that capability's directory into
   your project **at your recorded layout** — steps 4 and 5 have already established that the clone's
   layout and yours agree — and **appends** it to `capabilities` in `pharn.config.json`. Your
   `skillsVersion` is left as it was, and `commit` is refreshed to the SHA the clone was pinned to.

`CONSTITUTION.md` is **not** touched — `add` never changes your constitution. Your detected `archetypes`
are left unchanged; `add` only appends to `capabilities`.

## `pharn is too old for the current pharn-oss`

pharn-oss can ship a root `MIN_CLI` file declaring the **minimum pharn version** its content needs.
When your installed version is older, `add` refuses **before anything is written** and before the
picker renders, cleans up the temporary clone, and exits 1. Upgrading
(`npm install -g @pharn-dev/pharn@latest`) is the fix.

This refusal takes priority over the version mismatch below, on purpose: `pharn update` — which the
version mismatch tells you to run — would be refused for the same reason, so upgrading is the only
step that actually resolves it.

A `MIN_CLI` that is missing, unreadable, or malformed imposes **no** constraint (a warning at most).

## Skipped upstream capabilities

`add` always clones the tip of `main`, so a capability can exist upstream in a shape your installed
pharn version cannot read yet. `add` names each one and continues:

```text
1 upstream capability could not be read and was SKIPPED — not installed:
  griller:backwards-compat (pharn/pharn-pipeline/grillers) — missing its markdown backwards-compat/backwards-compat.md.
```

Such a capability is **not addressable**: `pharn add backwards-compat` reports it as an unknown
capability and lists the ones that do work. pharn will not install content it could not validate.
Upgrade pharn, or wait for upstream to finish the change.

## Version mismatch

`add` always clones the tip of `pharn-dev/pharn-oss@main`, so the clone can be **newer** than what you
installed. Copying one capability from that clone and recording the clone's version would claim your
whole install had moved to it, when every other file still holds the old version's bytes — and
[`pharn update`](update.md) would then see a matching version and report "Already up to date" over a
stale install.

So `add` refuses when the two disagree, in **either** direction (a clone older than your config — a
rollback or a hand-edited value — refuses the same way):

```text
⚠ Skills version mismatch: pharn.config.json records v1.0.0, but the fetched
  github.com/pharn-dev/pharn-oss is at v2.3.0. `pharn add` installs only at the version your
  project is already on — run `pharn update` first, then re-run `pharn add`.
```

The refusal happens **before anything in your project is written** and before the interactive picker
renders: no capability directory is copied, and neither `pharn.config.json` nor
[`pharn.records.json`](../reference/pharn-records.md) is touched. It exits non-zero. (The clone
itself has already been fetched by then — that is where the version being compared is read from.)

Run [`pharn update`](update.md) to bring your install to the current version, then re-run `pharn add`.

**Known limit.** There is no way to add a capability to a deliberately-pinned older install — `add`
has no `--force`, and `pharn update` is the only resolution. Matching versions is the condition under
which `add` can promise anything about the tree it is adding to.

## Layout mismatch

PHARN ships in one of two install layouts — the legacy **flat** layout (surfaces at your repo root) and
the **`pharn`** layout (everything under `pharn/`). Your `pharn.config.json` records which one your
project uses, and that recorded value is what [`remove`](remove.md) and [`status`](status.md) use to
find your files.

`add` refuses when the clone's layout is not the one your config records:

```text
⚠ Install layout mismatch: pharn.config.json records the `flat` layout, but the fetched
  github.com/pharn-dev/pharn-oss uses the `pharn` layout. `pharn add` installs only at the layout
  your project is already recorded at — adding here would put files where `pharn remove` and
  `pharn status` will never look for them. Run `pharn update --force` first, then re-run `pharn add`.
```

Without this check, `add` would copy the capability at the **clone's** layout while your config still
described the other one — so the files would land somewhere nothing else ever looks. `pharn list`
would still show it — `list` reads only `pharn.config.json` and never touches the filesystem — which is
what makes the failure so quiet: the inventory says installed while `pharn status` finds nothing at the
recorded layout, and a later `pharn remove` would report
_"its files were already gone"_ while dropping only the config entry, leaving the directory orphaned on
disk permanently.

**Why `add` does not simply record the clone's layout** (which is what [`update`](update.md) does):
`update` may record it only because it rewrites your **whole** install at the new layout, whereas `add`
writes a **single** capability — so recording it here would re-point `remove`/`status` at paths where
none of your other capabilities, docs, or contracts actually live, turning one misplaced directory into
an install-wide one. Migrating a tree is `update`'s job, so the refusal sends you there.

The refusal happens **before anything in your project is written** and before the interactive picker
renders, and it exits non-zero. It is symmetric: a `pharn`-layout project meeting a flat clone refuses
the same way.

> **If `pharn update` reports "Already up to date".** A layout mismatch can occur while your
> `skillsVersion` already matches upstream (an install migrated by an older CLI, or a hand-edited
> `layout`). Plain `pharn update` returns early at a matching version and will not rewrite the layout —
> use **`pharn update --force`**, which re-applies the whole tree at the clone's layout and copies every
> file it overwrites into `.pharn-backup/<timestamp>/` first.

Each capability `add` installs is recorded with `"source": "manual"`, which is what makes the override
stick: [`pharn update`](update.md) preserves manual entries instead of replacing your capability list
with the freshly-resolved archetype set. Before this field existed, an `add` was silently deleted by the
next `update` — a source-less entry is now inferred as manual on that first update, and kept only while
the capability still exists in the latest index (dropped with a named report line if upstream removed it).
See [`capabilities[].source`](../reference/pharn-config.md#capabilitiessource--selection-provenance).

## Overwrite protection

`add` copies a whole capability directory. If files already exist there, the ones whose contents
**differ** from upstream's are copied into `.pharn-backup/<timestamp>/` **before** anything is
overwritten — the same backup directory [`pharn update --force`](update.md) writes, preserving each
file's project-relative path:

```text
Backed up 1 file(s) to .pharn-backup/20260908-141530 before overwriting.
```

Files that are already **byte-identical** to upstream are not backed up — re-adding an untouched
capability stays silent. Files that do not exist yet are simply created, so a normal first-time `add`
never produces a backup directory. Files that are in the directory but **not** part of the capability
upstream are never touched at all, and are never recorded in
[`pharn.records.json`](../reference/pharn-records.md) — `add` records only the files it actually
copied.

**Why this exists.** [`pharn update`](update.md) never deletes: when a capability stops being
selected, its directory is left on disk and the report says so. If you then edit those files and
later run `pharn add <name>` for that same capability, the add is not a no-op — the config entry is
gone — so the copy lands on your edits. The backup is what makes that recoverable.

If the backup itself cannot be written (for example `.pharn-backup` is a symlink, or a file to be
saved sits under one), `add` **aborts before copying anything** and your files are left exactly as
they were.

### Symlinks inside a capability directory

`add` **refuses** — writing nothing — when a path it would copy sits under a **symlinked directory**
in your project:

```text
⚠ Refusing to add a11y: `pharn/pharn-pipeline/grillers/a11y/evals` in your project is a symlink, and
  `pharn/pharn-pipeline/grillers/a11y/evals/basic.md` sits under it. `pharn add` copies the whole
  capability directory, which would write THROUGH that link and replace files it points at —
  possibly outside your project — and those cannot be backed up. Replace the symlink with a real
  directory (or move it aside), then re-run `pharn add a11y`.
```

The copy is a recursive `cpSync` that guards only its **source**. On the destination side a symlinked
intermediate directory is followed, so the copy would overwrite whatever it points at — and a backup
cannot help, because saving a symlink's contents means saving its _target_, not the link. Refusing is
the only outcome that leaves your files as they were. Replace the symlink with a real directory and
re-run. ([`update`](update.md) reaches the same answer by a different route: it classifies such a path
`unreadable` and skips it.)

**Known limit.** This is a check made just before the copy, not a lock held across it. A directory
that becomes a symlink in the moment between the two is not caught — the copy itself guards only its
source. What the check covers is the case that actually happens: a symlink already in your project
when you run `add`. A concurrent local process racing the install is not something `pharn` defends
against today.

> **This is a copy, not a merge.** `add` still overwrites the destination with upstream's version —
> it simply no longer does so irreversibly. Restoring is your call: the backup directory is printed
> as soon as it is written, so it stays visible even if a later step fails.

**Retention is yours**, exactly as for [`update --force`](update.md#--force-and-pharn-backup): `pharn`
never prunes `.pharn-backup/` and never edits your `.gitignore`, so the directories accumulate and are
committable by accident — and a picker run that overwrites edits in several capabilities writes **one
per capability**. Delete them once you are happy, or add `.pharn-backup/` to your `.gitignore`.

## The capability argument

`<name>` is a capability's directory name (e.g. `a11y`, `security`, `n-plus-one`). Use the
`<role>:<name>` form (`griller:` or `lens:`) when the same name exists in both roles, or to be explicit.

- **Already installed** → a no-op with a message.
- **Unknown name** → the CLI lists every valid `role:name` address.
- **Ambiguous** (a name in both roles, given without a role) → the CLI asks you to disambiguate with
  `griller:` / `lens:`.
- **An extra positional** (`pharn add a11y extra`) → refused with `Unexpected argument: "extra"` on
  stderr and exit 1. It used to be silently dropped.

## Options

`add` takes **none**. Passing any flag is a hard refusal, not a no-op:

```console
$ pharn add --force a11y
Unsupported option for `add`: "--force"
```

It prints the usage text to stderr and exits **1**. See
[Unsupported option for this command](../troubleshooting.md#unsupported-option-for-this-command).
`--help`/`-h` and `--version`/`-v` work here as everywhere.

## Concurrency

`add` takes the project lock (`.pharn.lock`) before it downloads anything, and holds it across the
copy — and, on the bare picker path, across your multi-select. A second `pharn` writer refuses with a
named message and exit 1 rather than queueing; `pharn list` and `pharn status` are never blocked. One
consequence worth knowing: under a held lock, even `pharn add bogus` reports the lock rather than
listing the valid `role:name` addresses, because that list lives in the clone it never fetched. See
[Another pharn process is running](../troubleshooting.md#another-pharn-process-is-running).

## Bare `pharn add` (no argument)

Run `pharn add` with no argument **in an interactive terminal** to open a multi-select picker, grouped
by role (grillers / lenses), listing the capabilities you don't already have. Already-installed
capabilities are shown as an `Installed (N): …` summary above the list, not as options — `add` is
additive-only. Pick zero or more, and each is installed through the **same** per-capability path as
`pharn add <name>`, echoed as it lands. An empty selection is a no-op.

The picker only opens when both stdin and stdout are a TTY. In a non-interactive context (CI, a pipe),
`pharn add` with no argument does **not** prompt — it exits with a usage error pointing you at
`pharn add <name>` or an interactive terminal.

`add` also merges the capability's files into [`pharn.records.json`](../reference/pharn-records.md) so a
later `pharn update` can upgrade them cleanly. It only extends a store that already exists and is
readable — it never creates one (that is `pharn init`'s job).

## Related

- [init](init.md)
- [update](update.md)
- [pharn.config.json](../reference/pharn-config.md)
- [pharn.records.json](../reference/pharn-records.md)
