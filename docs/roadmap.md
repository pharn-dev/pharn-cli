# Roadmap

What PHARN CLI does today versus what is planned.

## Today (v0.2)

| Capability | Status |
| ---------- | ------ |
| Interactive `pharn init` wizard (modules + stack pack + constitution) | Shipped |
| Manifest-driven wizard (`schemaVersion 2`): Default/Custom stack questions + per-tech skills | Shipped |
| Selective skill install + `pharn add <category>:<skill>` | Shipped |
| Fetch module catalog from `pharn-dev/pharn-oss` `manifest.json` | Shipped |
| Dependency resolution + stack-pack exclusivity | Shipped |
| Clone repo and copy each module's `installs` into `.claude/` | Shipped |
| Materialize `memory-bank/` and the chosen `CONSTITUTION.md` | Shipped |
| Pin commit SHA + write `pharn.config.json` | Shipped |
| `pharn add <module>` — add a module to an existing project | Shipped |
| `pharn remove <module \| category:skill>` — remove a module or skill | Shipped |
| `pharn update` — refresh installed modules to the latest version | Shipped |
| `pharn list` — show installed + available modules/skills (read-only, `--json`) | Shipped |
| `pharn status` — read-only version + local-drift report (modified/missing PHARN-owned files; `--strict`, `--no-drift`) | Shipped |

## Planned

| Capability | Description |
| ---------- | ----------- |
| Vendor official-skill fetching | `init` records consent for vendor skills (e.g. Supabase) today; automatic fetching of those official skills from the vendor registry, with SHA pinning, is not built yet |
| Stack scaffolding | Install npm packages / generate app code from the stack pack |
| Additional stack packs | Beyond `pharn-stack-nextjs` |
| Migration for existing projects | Onboard repos with significant git history (today the CLI only warns) |
| Orphaned-file detection in `pharn status` | `status` today reports modified + missing PHARN-owned files; flagging files left orphaned in `.claude/` after an upstream rename (see [remove](commands/remove.md)) is not built yet |
| Other agents | Codex and Cursor in addition to Claude Code |

## Related

- [Getting started](getting-started.md)
- [init](commands/init.md)
- [add](commands/add.md)
- [remove](commands/remove.md)
- [update](commands/update.md)
- [list](commands/list.md)
- [status](commands/status.md)
- [pharn.config.json](reference/pharn-config.md)
