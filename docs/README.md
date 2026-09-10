# PHARN CLI documentation

`pharn` installs [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code — into your project. Run `pharn init` to detect your project's archetype(s) and install the applicable PHARN **capabilities** (grillers + lenses) from `pharn-dev/pharn-oss`, alongside the fixed product surfaces: the `pharn-*` commands and `.cjs` hooks under `.claude/`, the contracts, `pharn-core` and floor checkers, four trusted docs, upstream's `LICENSE` copy, and the root `features/README.md`. It then writes `pharn.config.json` and `pharn.records.json`.

The install **mirrors whichever layout upstream ships**. Today that is the `pharn` layout: most surfaces move under `pharn/`, while `THREAT-MODEL.md`, `LIMITS.md`, `features/README.md` and `.claude/` stay at the project root. The legacy `flat` layout keeps everything at the root; an install records which one it used in `pharn.config.json`.

The CLI version (`0.4.0`) and the content version it installs (`skillsVersion`, from upstream's `SKILLS_VERSION`) are independent numbers — `status` and `update` are keyed to the latter.

## Getting started

- [Getting started](getting-started.md) — prerequisites, first run, post-init workflow

## Commands

- [init](commands/init.md) — detect archetypes and install capabilities (the default command)
- [add](commands/add.md) — add a single capability to an existing project
- [remove](commands/remove.md) (alias `rm`) — remove an installed capability from an existing project
- [update](commands/update.md) — re-fetch installed capabilities at the latest skills version
- [list](commands/list.md) — list installed archetypes + capabilities
- [status](commands/status.md) — read-only version + local-drift audit; `--strict` exits 1 on any outdated/modified/missing/unreadable file, and neither `status` nor `list` is ever blocked by another `pharn` run's lock

## Reference

- [pharn.config.json](reference/pharn-config.md) — config file schema and overwrite behavior
- [pharn.records.json](reference/pharn-records.md) — the per-file install hashes `pharn update` compares against

## Other

- [Troubleshooting](troubleshooting.md) — common failures and `PHARN_DEBUG`
- [Roadmap](roadmap.md) — what's shipped and what's planned
- [Contributing](../CONTRIBUTING.md) — developing the CLI and keeping docs in sync
- [Contributor guide](contributing.md) — quality gates, test map, and the security-sensitive modules
- [Releasing](RELEASING.md) — maintainer release steps and Trusted Publishing
