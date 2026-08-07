# Troubleshooting

## Exit codes

| Situation                                                                                               | Exit code |
| ------------------------------------------------------------------------------------------------------- | --------- |
| Prerequisite failure (no `.git`)                                                                        | 1         |
| Capability fetch / install failure                                                                      | 1         |
| Unknown command                                                                                         | 1         |
| `add` / `update` / `remove` / `list` / `status` with no `pharn.config.json` (or a pre-archetype config) | 1         |
| `update` completed but skipped files it could not verify                                                | 0         |
| `update --force` aborted because a backup could not be written                                          | 1         |
| User cancel at summary, or overwrite declined                                                           | 0         |
| Successful install                                                                                      | 0         |

## `pharn update` skipped my files

By default, `update` skips **present** PHARN-owned files it cannot prove are untouched (missing
expected files are still restored). It prints each skipped file under one of three labels:

- **`modified`** — you edited it after `pharn` wrote it.
- **`unrecorded`** — `pharn` has no record of writing that path.
- **`unverifiable`** — there is no usable `pharn.records.json` (absent, malformed, stamp-mismatched,
  or from a newer schema), so present differences cannot be proven. Every install created before
  `pharn` 0.4.0 hits this once for differing files; **missing** files are still restored.

Exit code is **0** — this is the designed outcome, not a failure. To overwrite them anyway:

```bash
pharn update --force   # backs up each skipped file to .pharn-backup/<timestamp>/, then overwrites
```

Files already byte-identical to upstream are left alone (`ok`) — `--force` only overwrites the skip
buckets.

A run with skips deliberately leaves `skillsVersion` at the previous value, so `pharn status` keeps
showing an update as available and the next `pharn update` still has work to do. See
[update](commands/update.md) for the full decision table.

### `--force` aborted with a backup error

The backup runs to completion before any original is touched, so an abort means **nothing was
overwritten**. Inspect `.pharn-backup` at your project root:

- **A regular file** named `.pharn-backup` (not a directory) blocks the backup directory from being
  created — **move or rename** it, then re-run. Do not delete it until you have confirmed it is not
  something you need.
- **A symlink** at `.pharn-backup` — `pharn` refuses to write backups through it. Confirm that path
  is the one named in the error, then remove or replace the symlink and re-run.

A symlink in a source file's path (or one of its parent directories) is also rejected; the error names
the component.

## Prerequisites failed

`pharn init` has one prerequisite — a git repository. There is no stack-pack or package prerequisite:
archetype detection reads `package.json` names and the file tree, and installs whatever capabilities
apply.

### Git not found

The CLI message says "git not found" but the check is for a **`.git` directory**, not the `git` binary:

```text
✗ git not found.
  Run: git init && git add -A && git commit -m 'init'
  Then re-run: npx @pharn-dev/pharn init
```

Exits with code **1**.

### Monorepos / workspaces

`pharn init` checks the **current directory** for a `.git` directory, reads the `package.json` there for archetype detection, and installs into that directory. It does not walk up to a workspace root or into workspace packages. In a monorepo, run it from the directory that contains both `.git` and the app's `package.json`. Split layouts (`.git` at the root, the app's `package.json` in `apps/web/`) are unsupported in v1.

## Overwrite warnings

Not an error. Just before installing, `pharn init` lists which of its actual write targets already
exist in your project (capability dirs, product commands/hooks, contracts, floor checkers, the
constitution, and `pharn.config.json`) and asks you to confirm before overwriting. Confirm to continue
or cancel to exit cleanly (code 0); the default is **no**.

- If **nothing** conflicts, there is no prompt at all.
- `.claude/settings.json` is never overwritten, so it never triggers the warning.
- On a re-install the list is long, so it is capped (first 10 shown, then "…and N more").

## Capabilities could not be fetched

Symptoms:

- Spinner stops with "Failed to fetch PHARN" / "Failed to fetch capabilities"
- Message references `github.com/pharn-dev/pharn-oss`
- Exit code 1

`init` / `add` / `update` degit-clone `pharn-dev/pharn-oss`; `update` and `status --no-drift` also fetch the root `SKILLS_VERSION` from `raw.githubusercontent.com`. Check network access to GitHub and that the repo is reachable.

## Install failed

Symptoms:

- Spinner stops with "Failed to install capabilities"
- Exit code 1

Causes include a degit clone failure (network/GitHub), or a selected capability missing at its expected path (`<subtree>/<name>/<name>.md`) in the fetched repo. Set `PHARN_DEBUG=1` and re-run for the full stack trace:

```bash
PHARN_DEBUG=1 npx @pharn-dev/pharn init
```

## Overwrite declined

If any install targets already exist and you decline the overwrite prompt, the wizard cancels with exit 0 and nothing is written (the temporary clone is cleaned up).

## `add` / `update` say to run init first

```text
No pharn.config.json found. Run `pharn init` first.
```

All non-`init` commands operate on an already-installed project. Run `pharn init` to create `pharn.config.json`.

### Legacy (pre-archetype) config

```text
This project uses the legacy module layout (pre-archetype), which is no longer supported. Re-run `pharn init` to reinstall with the archetype/capability model.
```

If your `pharn.config.json` predates the archetype model (it has `modules` but no `capabilities`), the module/manifest install path it relied on has been removed (live pharn-oss ships no `manifest.json`). Re-run `pharn init` to reinstall using archetype detection.

## A command rejects an invalid config (does NOT say "run init")

```text
models.default has invalid model "gpt-4" (expected one of opus-4-8, sonnet-5, fable-5, haiku-4-5)
```

If `pharn.config.json` **exists but was hand-edited into an invalid state**, `add` / `status` /
`update` / `remove` / `list` print the loud, specific error above (naming the offending field) and
exit non-zero — they do **not** say to run `pharn init` (the file is there; re-running init would
offer to clobber your edits). Fix the named field and re-run. The `models` / `seam` blocks reject an
out-of-enum value, an unknown key (e.g. a typo'd `stgaes` / `haltOnUnknwon`), a duplicate
`resolutionOrder` step, or a `modelConfidenceThreshold` with no `model` step to gate.

## Unknown command

```text
Unknown command: ...
```

Run `pharn --help`. Valid commands: `init`, `add`, `remove`, `update`, `list`, `status`.

## Local development issues

| Problem                             | Fix                                             |
| ----------------------------------- | ----------------------------------------------- |
| `pharn` not found after editing CLI | `npm run build:install-local` from `pharn-cli/` |
| Type errors in tests                | `npm run typecheck`                             |
| Stale dist                          | `npm run build`                                 |

See [Contributing](../CONTRIBUTING.md).

## Related

- [Getting started](getting-started.md)
- [init command](commands/init.md)
- [pharn.config.json](reference/pharn-config.md)
