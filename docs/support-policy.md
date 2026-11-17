# Support policy

Which installs, configs and `pharn` versions the CLI keeps working with, and what it stops handling, when. It applies from v0.20.0. Maintainers: the full rules and the code each change touches are in the [contributor guide](contributing.md#support-policy).

## Which installs are supported

`pharn update`, `add`, `remove`, `list`, `status` and `uninstall` support an install made by the current minor version of `pharn` or the previous one. With v0.20.x, that is an install from 0.19.x or 0.20.x; with v0.21.x, one from 0.20.x or 0.21.x.

Running `pharn update` with each minor release keeps an install inside that window. Each version's [CHANGELOG](../CHANGELOG.md) names, under **Removed**, what it stopped handling and the last version that did.

## If your install is older

Re-run `pharn init` with the current CLI (`npx @pharn-dev/pharn@latest init`). It replaces the install and keeps the capabilities you added with `pharn add`, as `manual` ones ([init](commands/init.md)). Files you edited are backed up to `pharn/.backup/` before they are overwritten, and your `pharn/memory-bank/` is never touched.

## Teammates on different `pharn` versions

`pharn.config.json` records `pharnVersion`, the `pharn` that last wrote it. A `pharn` older than that version's major.minor **warns** before it writes, and still goes ahead: `init` over an existing install, `add`, `remove`, `update` and `uninstall` print one line on stderr naming both versions and how to upgrade, and `pharn status` and every `--dry-run` print it too (a `--json` report is unchanged). A patch or prerelease difference does not warn. `pharn` 0.19.x and older do not check it, so if anyone on the team may run one, pin the same version across the team, for example as a `devDependency` ([troubleshooting](troubleshooting.md#pharnconfigjson-was-written-by-a-newer-pharn)).

## `--json` output

Every `--json` report carries `schemaVersion: 1`. Within `1` a new key can appear (absent when empty), and none is removed, renamed or changes meaning. A change that breaks a reader bumps `schemaVersion`, and the CHANGELOG says so.

## The `flat` layout is deprecated

Installs from a pharn-oss before the `pharn/` layout keep everything at the project root (`"layout": "flat"` in `pharn.config.json`, or no `layout` key). That layout is deprecated in v0.20.0 and removed in v0.22.0. A plain `pharn update` moves a `flat` install to the `pharn` layout ([Layout migrations](commands/update.md#layout-migrations)); delete the old top-level copies it leaves behind by hand. On a `flat` install, `pharn status` and `pharn update` print a `DEPRECATED` note that says so. It is advisory: `status --strict` does not fail on it, and `--json` reports carry no notice (`status --json` already reports `layout.recorded: "flat"`, and `update --dry-run --json` reports the move as `plan.abandonedLayout: "flat"`).

## What is being retired

| Version | No longer handled                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.20.0 | A root `.pharn.lock` left by `pharn` 0.13.0 or older, the notice about a root `.pharn-backup/` directory (`pharn` never deletes it; move what you need and delete it yourself), and `pharn update`'s `.gitignore` hints for those two names. The `models` block format `pharn` wrote before 0.7.0 is no longer converted by `update`.                                   |
| v0.21.0 | `init` no longer writes `"modules": []` into `pharn.config.json`, so `pharn` 0.19.x and older cannot read a config that 0.21.0 or later wrote (0.20.0 is the oldest that can). The unused fields older configs carry (`modules`, `constitution`, `installedSkills`, `stackAnswers`, `isMultiTenant`) still load, and are dropped the next time `pharn` writes the file. |
| v0.22.0 | The `flat` layout. Fetching a pharn-oss older than 7.21.0, which ships no `pharn-install.json` (so also one older than 7.0.0, with trusted docs at the project root), and the root-footprint migration of installs made from one ([details](commands/update.md#the-root-footprint-migration)).                                                                          |

## Related

- [pharn.config.json](reference/pharn-config.md)
- [update](commands/update.md)
- [Roadmap](roadmap.md)
