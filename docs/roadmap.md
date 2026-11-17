# Roadmap

What PHARN CLI does today versus what is planned.

## Today

What the latest release does; the [CHANGELOG](../CHANGELOG.md) says which version added each.

| Capability                                                                                                                                                                                                                                                                                     | Status  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Archetype-driven `pharn init` — detect `ssr`/`backend`/`spa`/`lib` from `package.json` names + a bounded, symlink-safe file-tree scan                                                                                                                                                          | Shipped |
| Resolve applicable capabilities (grillers + lenses) by `applies` (`universal` or an intersecting archetype), skipping the rest with a reason                                                                                                                                                   | Shipped |
| Fetch `pharn-dev/pharn-oss` as a SHA-pinned `codeload` tarball and copy capabilities + fixed product surfaces into the mirrored `pharn/` layout                                                                                                                                                | Shipped |
| Copy the canonical `CONSTITUTION.md` verbatim + the other trusted docs, upstream's `LICENSE` and `pharn/features/README.md`; write `pharn.config.json` (`pharnVersion`, `skillsVersion`, `repo`, `commit`, `installedAt`, archetypes, capabilities, layout, `models`) and `pharn.records.json` | Shipped |
| `pharn add <name \| role:name>` — add one capability to an existing project                                                                                                                                                                                                                    | Shipped |
| `pharn remove <name \| role:name>` — remove an installed capability (no clone, no network)                                                                                                                                                                                                     | Shipped |
| `pharn update` — re-resolve recorded archetypes and re-fetch capabilities from the channel the install records (the newest verified release, or `main`'s tip)                                                                                                                                  | Shipped |
| `pharn list` — read-only inventory of installed archetypes + capabilities (`--json`)                                                                                                                                                                                                           | Shipped |
| `pharn uninstall` — delete the PHARN files pharn can prove it wrote and nobody changed (offline; edited and unrecorded files are kept and listed; `--yes`)                                                                                                                                     | Shipped |
| `pharn status` — read-only version + capability-drift report (modified/missing/unreadable PHARN-owned files; `--strict`, `--no-drift`)                                                                                                                                                         | Shipped |
| `pharn.records.json` — a sha256 of every installed file, so `update` can tell pharn's bytes from your edits                                                                                                                                                                                    | Shipped |
| Orphaned-file detection — `update` and `status` name the files upstream stopped shipping that are still in your project (`ORPHANED` note, `orphans` in `--json`); nothing is deleted                                                                                                           | Shipped |
| Drift-safe `update` — per-file decisions, `--force` with `pharn/.backup/<timestamp>/` (also written by `init`, `add`, `remove` and `uninstall`)                                                                                                                                                | Shipped |
| Single-writer lock (`pharn/.lock`) for `init`/`add`/`remove`/`update`/`uninstall`; `list`/`status` never take it                                                                                                                                                                               | Shipped |
| `MIN_CLI` forward-compatibility gate — refuses cleanly when upstream needs a newer CLI                                                                                                                                                                                                         | Shipped |
| Mixed-version warning — a `pharn` older than the config's recorded `pharnVersion` (major.minor) warns on stderr before it writes, and still writes ([support policy](support-policy.md))                                                                                                       | Shipped |
| Proxy-environment notice — Node's `fetch` reads no proxy variable unless `NODE_USE_ENV_PROXY=1`, so a configured one is reported as used or unused                                                                                                                                             | Shipped |
| Per-command option allowlist — an option a command does not take exits 1 instead of being ignored                                                                                                                                                                                              | Shipped |
| No prompt off a TTY — `init`, `update`, `uninstall` and the bare `add`/`remove` capability picker exit 1 instead of waiting; `update --yes` and `uninstall --yes` skip the confirmation, and `init --yes` is below                                                                             | Shipped |
| `--ref latest\|main` — `init` installs from the newest verified pharn-oss release by default (refusing when it cannot be resolved) or from `main`'s tip; the channel is recorded, `update`/`add`/`status` follow it, and `update --ref` switches it                                            | Shipped |
| `init --dry-run [--json]` (a preview that writes nothing) and `init --yes` (a prompt-free install that refuses wherever it would overwrite a file)                                                                                                                                             | Shipped |
| `seam` block left to pharn-oss: never written or validated, carried verbatim by every command                                                                                                                                                                                                  | Shipped |
| pharn-oss's `models` block — copied by `init`, kept or upgraded by `update`, shown resolved per stage by `status`                                                                                                                                                                              | Shipped |
| `flat` layout removed (v0.21.0) — a project still recorded at it is asked to re-run `pharn init`; the root-doc fallback and the root-footprint migration go with it ([support policy](support-policy.md))                                                                                      | Shipped |

## Planned

| Capability                      | Description                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework-specific capabilities | Beyond today's universal + archetype-triggered set                                                                                                                      |
| Stack scaffolding               | Install npm packages / generate app code for a detected framework                                                                                                       |
| Migration for existing projects | Onboard repos with significant git history (today the CLI only requires a `.git` directory and hard-fails without one; it never inspects history and issues no warning) |
| Other agents                    | Codex and Cursor in addition to Claude Code                                                                                                                             |

## Related

- [Getting started](getting-started.md)
- [init](commands/init.md)
- [add](commands/add.md)
- [remove](commands/remove.md)
- [update](commands/update.md)
- [list](commands/list.md)
- [status](commands/status.md)
- [uninstall](commands/uninstall.md)
- [pharn.config.json](reference/pharn-config.md)
- [Support policy](support-policy.md)
