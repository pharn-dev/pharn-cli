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
3. Resolves your argument against that index. If it uniquely names a capability you don't already have,
   it copies that capability's directory into the mirrored layout and **appends** it to `capabilities`
   in `pharn.config.json` (also refreshing `skillsVersion` and `commit`).

`CONSTITUTION.md` is **not** touched — `add` never changes your constitution. Your detected `archetypes`
are left unchanged; `add` only appends to `capabilities`.

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

## Related

- [init](init.md)
- [update](update.md)
- [pharn.config.json](../reference/pharn-config.md)
