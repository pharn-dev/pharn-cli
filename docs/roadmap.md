# Roadmap

What PHARN CLI does today versus what is planned.

## Today (v0.4)

| Capability | Status |
| ---------- | ------ |
| Archetype-driven `pharn init` — detect `ssr`/`backend`/`spa`/`lib` from `package.json` names + a bounded, symlink-safe file-tree scan | Shipped |
| Resolve applicable capabilities (grillers + lenses) by `applies` (`universal` or an intersecting archetype), skipping the rest with a reason | Shipped |
| Fetch `pharn-dev/pharn-oss` as a SHA-pinned `codeload` tarball and copy capabilities + fixed product surfaces into the mirrored layout (`flat` or `pharn/`) | Shipped |
| Copy the canonical `CONSTITUTION.md` verbatim + the other trusted docs, upstream's `LICENSE` and `features/README.md`; write `pharn.config.json` (`pharnVersion`, `skillsVersion`, `repo`, `commit`, `installedAt`, archetypes, capabilities, layout, `models`, `seam`) and `pharn.records.json` | Shipped |
| `pharn add <name \| role:name>` — add one capability to an existing project | Shipped |
| `pharn remove <name \| role:name>` — remove an installed capability (no clone, no network) | Shipped |
| `pharn update` — re-resolve recorded archetypes and re-fetch capabilities at the latest version | Shipped |
| `pharn list` — read-only inventory of installed archetypes + capabilities (`--json`) | Shipped |
| `pharn status` — read-only version + capability-drift report (modified/missing/unreadable PHARN-owned files; `--strict`, `--no-drift`) | Shipped |
| `pharn.records.json` — a sha256 of every installed file, so `update` can tell pharn's bytes from your edits | Shipped |
| Drift-safe `update` — per-file decisions, `--force` with `.pharn-backup/<timestamp>/` (also written by `add`) | Shipped |
| Single-writer lock (`.pharn.lock`) for `init`/`add`/`remove`/`update`; `list`/`status` never take it | Shipped |
| `MIN_CLI` forward-compatibility gate — refuses cleanly when upstream needs a newer CLI | Shipped |
| Proxy-environment warning — Node's `fetch` reads no proxy variable, so a configured one is reported as unused | Shipped |
| Per-command option allowlist — an option a command does not take exits 1 instead of being ignored | Shipped |
| Interactive-only `init`/`update` (exit 1 off a TTY; `update --yes` for CI) + the capability picker for bare `add`/`remove` | Shipped |
| `models` + `seam` blocks written and validated on every fresh install | Shipped |

## Planned

| Capability | Description |
| ---------- | ----------- |
| Framework-specific capabilities | Beyond today's universal + archetype-triggered set |
| Stack scaffolding | Install npm packages / generate app code for a detected framework |
| Migration for existing projects | Onboard repos with significant git history (today the CLI only requires a `.git` directory and hard-fails without one; it never inspects history and issues no warning) |
| Orphaned-file detection in `pharn status` | `status` today reports modified, missing and unreadable PHARN-owned files; flagging files left orphaned after an upstream rename is not built yet |
| Per-stage model routing | `pharn init` writes and validates the `models` block and both `init` and `status` display it, but no installed stage consumes it for routing — editing it changes which model runs nowhere. When a consumer lands, drop this row and the **Coming soon** marker in [pharn.config.json](reference/pharn-config.md#model-routing) |
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
