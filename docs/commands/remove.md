# pharn remove

Remove a PHARN module or a single technology skill from an existing project (one with a `pharn.config.json`). The inverse of [`add`](add.md): it deletes exactly the files the module or skill contributed and updates `pharn.config.json` to match.

```bash
pharn remove <module>            # a whole methodology module / stack pack
pharn remove <category>:<skill>  # a single technology skill (schemaVersion 2)
pharn remove                     # interactive picker
pharn remove <module> --yes      # skip the confirmation prompt
```

`rm` is accepted as an alias for `remove`.

## Behavior

1. Reads `pharn.config.json`. If none exists, exits with a hint to run `pharn init` first.
2. An argument containing `:` removes a **skill** (§A); any other argument removes a **module** (§B); no argument opens the **interactive picker**, which lists only items that are genuinely removable (so you never pick something the command would refuse).

`CONSTITUTION.md` and everything under `memory-bank/` are **never** deleted — they are user-owned and materialized only at `init`.

## Removing a skill (`<category>:<skill>`)

Each skill lives in its own isolated `.claude/skills/<name>/` directory, so removal is precise and needs **no network and no clone** — the CLI works entirely from `installedSkills` plus your filesystem.

```bash
pharn remove orm:prisma   # deletes .claude/skills/prisma/
pharn remove auth:clerk   # deletes .claude/skills/clerk/
```

- Deletes the skill's directory and drops its entry from `installedSkills`.
- **Does not** touch `stackAnswers`, `modules`, `skillsVersion`, or `commit` — your recorded wizard answer stays authoritative.
- **Not installed** → a no-op (nothing is written). For an unrecognized address, the CLI lists the skills you actually have installed as the valid values.
- Already-deleted directory → treated as done (idempotent).

## Removing a module (`<module>`)

Modules share destination directories (`pharn-core`, `pharn-pipeline`, `pharn-review`, and `pharn-audits` all merge into `commands/`, `skills/`, `hooks/`, …), so `remove` never wipes a directory. It clones `pharn-dev/pharn-oss` once, reads the module's `installs` from the clone, computes the **exact** set of files that module contributed, and deletes only those — then prunes any directories left empty (never one that still holds another module's files).

Refusals (checked **before** anything is deleted or written — no partial removals):

- **`pharn-core`** is required by every other module and cannot be removed.
- A module that **is not installed** is reported and nothing happens.
- A module with **installed dependents** is refused, naming them — remove those first. (There is no automatic cascade.) This also blocks removing a stack pack's base, e.g. `pharn-stack-react` while `pharn-stack-nextjs` is installed.

Unless `--yes` / `-y` is given, the CLI confirms before deleting. `modules` in `pharn.config.json` is rewritten to the resolved survivor set; `skillsVersion`, `commit`, `stackAnswers`, and `installedSkills` are left unchanged.

### Orphan caveat

The contributed file set is computed from the repository's `main` branch, **not** the pinned `commit` recorded at install. If a file was renamed or removed upstream since you installed, an orphaned copy may remain in `.claude/`. This is acceptable for now; `pharn status` is planned to surface such orphans (see the [roadmap](../roadmap.md)).

## Related

- [add](add.md)
- [list](list.md)
- [pharn.config.json](../reference/pharn-config.md)
