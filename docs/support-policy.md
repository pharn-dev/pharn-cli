# Support policy

Which installs, configs and `pharn` versions the CLI keeps working with, and what it stops handling, when. It applies from v0.20.0. Maintainers: the full rules and the code each change touches are in the [contributor guide](contributing.md#support-policy).

## Which installs are supported

`pharn update`, `add`, `remove`, `list`, `status` and `uninstall` support an install made by the current minor version of `pharn` or the previous one. With v0.20.x, that is an install from 0.19.x or 0.20.x; with v0.21.x, one from 0.20.x or 0.21.x.

Running `pharn update` with each minor release keeps an install inside that window. Each version's [CHANGELOG](../CHANGELOG.md) names, under **Removed**, what it stopped handling and the last version that did.

## If your install is older

Re-run `pharn init` with the current CLI (`npx @pharn-dev/pharn@latest init`). It replaces the install and keeps the capabilities you added with `pharn add`, as `manual` ones ([init](commands/init.md)). Files you edited are backed up to `pharn/.backup/` before they are overwritten, and your `pharn/memory-bank/` is never touched.

## Teammates on different `pharn` versions

`pharn.config.json` records `pharnVersion`, the `pharn` that last wrote it. A `pharn` older than that version's major.minor will **warn** before it writes, and still go ahead. **Coming soon** ([roadmap](roadmap.md#planned)): today no command checks it. Until then, and for any `pharn` released before the check, pin the same version across the team, for example as a `devDependency`.

## `--json` output

Every `--json` report carries `schemaVersion: 1`. Within `1` a new key can appear (absent when empty), and none is removed, renamed or changes meaning. A change that breaks a reader bumps `schemaVersion`, and the CHANGELOG says so.

## The `flat` layout is deprecated

Installs from a pharn-oss before the `pharn/` layout keep everything at the project root (`"layout": "flat"` in `pharn.config.json`, or no `layout` key). That layout is deprecated in v0.20.0 and removed in v0.22.0. A plain `pharn update` moves a `flat` install to the `pharn` layout ([Layout migrations](commands/update.md#layout-migrations)). The notice in `pharn status` and `pharn update` that says so is **Coming soon** ([roadmap](roadmap.md#planned)).

## What is being retired

| Version | No longer handled                                                                                                                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.20.0 | A root `.pharn.lock` left by `pharn` 0.13.0 or older, the notice about a root `.pharn-backup/` directory (`pharn` never deletes it; move what you need and delete it yourself), and `pharn update`'s `.gitignore` hints for those two names. The `models` block format `pharn` wrote before 0.7.0 is no longer converted by `update`. |
| v0.21.0 | `init` stops writing `"modules": []` into `pharn.config.json`, so `pharn` 0.19.x and older can no longer read a config the current one writes. The unused fields of module-era configs (`modules`, `constitution`, `installedSkills`, `stackAnswers`, `isMultiTenant`) are no longer kept on read.                                    |
| v0.22.0 | The `flat` layout. Fetching a pharn-oss older than 7.21.0, which ships no `pharn-install.json` (so also one older than 7.0.0, with trusted docs at the project root), and the root-footprint migration of installs made from one ([details](commands/update.md#the-root-footprint-migration)).                                        |

## Related

- [pharn.config.json](reference/pharn-config.md)
- [update](commands/update.md)
- [Roadmap](roadmap.md)
