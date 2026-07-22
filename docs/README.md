# PHARN CLI documentation

`pharn` installs [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code — into your project. Run `pharn init` to detect your project's archetype(s) and install the applicable PHARN **capabilities** (grillers + lenses) from `pharn-dev/pharn-oss` into the mirrored layout (`.claude/` + `pharn/`), copying the canonical constitution and writing `pharn.config.json`.

## Getting started

- [Getting started](getting-started.md) — prerequisites, first run, post-init workflow

## Commands

- [init](commands/init.md) — detect archetypes and install capabilities (the default command)
- [add](commands/add.md) — add a single capability to an existing project
- [remove](commands/remove.md) — remove an installed capability from an existing project
- [update](commands/update.md) — re-fetch installed capabilities at the latest skills version
- [list](commands/list.md) — list installed archetypes + capabilities
- [status](commands/status.md) — read-only version + local-drift audit

## Reference

- [pharn.config.json](reference/pharn-config.md) — config file schema and overwrite behavior

## Other

- [Troubleshooting](troubleshooting.md) — common failures and `PHARN_DEBUG`
- [Roadmap](roadmap.md) — what's shipped and what's planned
- [Contributing](../CONTRIBUTING.md) — developing the CLI and keeping docs in sync
