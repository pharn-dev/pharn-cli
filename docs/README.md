# PHARN CLI documentation

`pharn-cli` installs [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code — into your project. Run `pharn init` to pick which modules and stack pack you want; the CLI fetches them from `pharn-dev/pharn-oss`, copies them into `.claude/`, materializes your constitution + memory bank, and writes `pharn.config.json`.

## Getting started

- [Getting started](getting-started.md) — prerequisites, first run, post-init workflow

## Commands

- [init](commands/init.md) — interactive setup wizard
- [add](commands/add.md) — add a module to an existing project
- [update](commands/update.md) — update installed modules to the latest skills version

## Reference

- [pharn.config.json](reference/pharn-config.md) — config file schema and overwrite behavior

## Other

- [Troubleshooting](troubleshooting.md) — common failures and `PHARN_DEBUG`
- [Roadmap](roadmap.md) — what's shipped and what's planned
- [Contributing](../CONTRIBUTING.md) — developing the CLI and keeping docs in sync
