# Roadmap

What PHARN CLI does today versus what is planned.

## Today (v0.2)

| Capability | Status |
| ---------- | ------ |
| Archetype-driven `pharn init` — detect `ssr`/`backend`/`spa`/`lib` from `package.json` names + a bounded, symlink-safe file-tree scan | Shipped |
| Resolve applicable capabilities (grillers + lenses) by `applies` (`universal` or an intersecting archetype), skipping the rest with a reason | Shipped |
| Degit-clone `pharn-dev/pharn-oss` (SHA-pinned) and copy capabilities + fixed product surfaces into the mirrored layout (`flat` or `pharn/`) | Shipped |
| Copy the canonical `CONSTITUTION.md` verbatim + write `pharn.config.json` (archetypes, capabilities, layout) | Shipped |
| `pharn add <name \| role:name>` — add one capability to an existing project | Shipped |
| `pharn remove <name \| role:name>` — remove an installed capability (no clone, no network) | Shipped |
| `pharn update` — re-resolve recorded archetypes and re-fetch capabilities at the latest version | Shipped |
| `pharn list` — read-only inventory of installed archetypes + capabilities (`--json`) | Shipped |
| `pharn status` — read-only version + capability-drift report (modified/missing PHARN-owned files; `--strict`, `--no-drift`) | Shipped |

## Planned

| Capability | Description |
| ---------- | ----------- |
| Framework-specific capabilities | Beyond today's universal + archetype-triggered set |
| Stack scaffolding | Install npm packages / generate app code for a detected framework |
| Migration for existing projects | Onboard repos with significant git history (today the CLI only warns) |
| Orphaned-file detection in `pharn status` | `status` today reports modified + missing PHARN-owned files; flagging files left orphaned after an upstream rename is not built yet |
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
