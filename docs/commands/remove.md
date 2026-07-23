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

## Related

- [add](add.md)
- [list](list.md)
- [pharn.config.json](../reference/pharn-config.md)
