# pharn remove

Remove a single installed **capability** — a griller or a lens — from an existing project (one with a
`pharn.config.json`). The inverse of [`add`](add.md): it deletes exactly that capability's directory and
drops its entry from `pharn.config.json`.

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
3. Deletes each selected capability's isolated directory and drops its entry from `capabilities`.

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

`--yes` / `-y` is accepted but has no effect — capability removal has no confirmation prompt to skip.

## Removing an auto-selected capability

If the entry's recorded `source` is `auto` — it was selected for your archetypes by
[`init`](init.md) or a prior [`update`](update.md) — `remove` prints a warning that the next
[`pharn update`](update.md) may re-add it if the latest resolution still selects it for your
archetypes, because update re-resolves your archetypes every run. Removing a `manual` entry (one you
added with [`add`](add.md)) warns nothing.

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
