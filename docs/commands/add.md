# pharn add

Add a PHARN module to an existing project (one with a `pharn.config.json`).

```bash
pharn add <module>            # whole methodology module / stack pack
pharn add <category>:<skill>  # a single technology skill (schemaVersion 2)
pharn add                     # interactive module picker
```

## Behavior

1. Reads `pharn.config.json`. If none exists, exits with a hint to run `pharn init` first.
2. Fetches `manifest.json` to list available modules.
3. Resolves the **union** of already-installed modules plus the new one, so any dependencies of the new module are pulled in too.
4. Clones `pharn-dev/pharn-oss`, copies the resolved modules' `installs` into `.claude/`, and updates `pharn.config.json` (`modules`, `skillsVersion`, `commit`).

`CONSTITUTION.md` is **not** touched — `add` never changes your constitution.

## Module argument

`<module>` must be a full module name (e.g. `pharn-review`, `pharn-stack-nextjs`). If you pass an unknown or already-installed name, the CLI tells you and falls back to the interactive picker, which lists only modules you don't already have.

## Category skill argument (schemaVersion 2)

`<category>:<skill>` installs one technology skill from a category module — for example:

```bash
pharn add orm:prisma     # installs pharn-skills-orm/skills/prisma
pharn add auth:clerk     # installs pharn-skills-auth/skills/clerk
```

`<category>` maps to `pharn-skills-<category>`; `<skill>` must be one of that category's wizard options. Behavior:

- **Already installed** → no-op with a message.
- **Conflicting sibling** (e.g. `orm:drizzle` already installed, you add `orm:prisma`) → the CLI asks before installing the second one alongside it. On yes, it appends to `installedSkills` but **does not** change your recorded `stackAnswers`.
- **Unknown category or skill** → the CLI lists the valid `category:skill` values.

This form requires a `schemaVersion 2` manifest (skills v0.69+). Against an older manifest, use a plain module name.

## Related

- [init](init.md)
- [update](update.md)
- [pharn.config.json](../reference/pharn-config.md)
