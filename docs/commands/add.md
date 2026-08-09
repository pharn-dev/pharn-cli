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
   a hint to run `pharn init` first.
2. Clones `pharn-dev/pharn-oss` (SHA-pinned) and reads the capability index from the clone.
3. **Checks the version.** If the clone's `SKILLS_VERSION` does not match the `skillsVersion` recorded
   in your `pharn.config.json`, `add` **refuses** — see [Version mismatch](#version-mismatch) below.
4. **Checks the layout.** If the clone's install layout does not match the `layout` recorded in your
   `pharn.config.json`, `add` **refuses** — see [Layout mismatch](#layout-mismatch) below.
5. Resolves your argument against that index. If it uniquely names a capability you don't already have,
   it copies that capability's directory into your project **at your recorded layout** — steps 3 and 4
   have already established that the clone's layout and yours agree — and **appends** it to
   `capabilities` in `pharn.config.json`. Your `skillsVersion` is left as it was, and `commit` is
   refreshed to the SHA the clone was pinned to.

`CONSTITUTION.md` is **not** touched — `add` never changes your constitution. Your detected `archetypes`
are left unchanged; `add` only appends to `capabilities`.

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
  `pharn status` will never look for them. Run `pharn update` first, then re-run `pharn add`.
```

Without this check, `add` would copy the capability at the **clone's** layout while your config still
described the other one — so the files would land somewhere nothing else ever looks. The capability
would be invisible to `pharn list` and `pharn status`, and a later `pharn remove` would report
*"its files were already gone"* while dropping only the config entry, leaving the directory orphaned on
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

## The capability argument

`<name>` is a capability's directory name (e.g. `a11y`, `security`, `n-plus-one`). Use the
`<role>:<name>` form (`griller:` or `lens:`) when the same name exists in both roles, or to be explicit.

- **Already installed** → a no-op with a message.
- **Unknown name** → the CLI lists every valid `role:name` address.
- **Ambiguous** (a name in both roles, given without a role) → the CLI asks you to disambiguate with
  `griller:` / `lens:`.

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
