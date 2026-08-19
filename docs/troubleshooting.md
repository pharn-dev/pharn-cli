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

If any install targets already exist and you decline the overwrite prompt, the wizard cancels with exit 0 and **nothing is written into your project** (the temporary clone is cleaned up).

One thing *is* written outside your project, before either prompt appears: the repo fetch runs first, and `degit` persists a commit-named `.tar.gz` plus `map.json`/`access.json` into its own shared cache directory (`~/Library/Caches/degit` on macOS, `%LOCALAPPDATA%\degit` on Windows, `$XDG_CACHE_HOME`/`~/.cache` + `/degit` elsewhere). That cache is degit's, not pharn's, and declining the prompt does not remove it — delete the directory yourself if you need to reclaim the space.

## Proxy environment variables

`init` / `add` / `update` / `status` clone `pharn-dev/pharn-oss` through [`degit`](https://github.com/Rich-Harris/degit), and **degit reads the proxy from the environment itself** — `pharn` passes it no proxy option and has no way to. Two consequences are worth knowing, and `pharn` now prints a line about each **before** it starts the clone.

### `HTTPS_PROXY` is not read on macOS or Linux

degit reads **only the lowercase `https_proxy`**. If you set any other spelling and nothing else, the clone connects **directly**, ignoring your proxy:

```text
⚠ HTTPS_PROXY is set, but degit 3.8.0 reads only the lowercase https_proxy —
  the PHARN clone will connect DIRECTLY. Set https_proxy to the same value if
  you meant to proxy it.
```

The fix is to set both:

```bash
export https_proxy="$HTTPS_PROXY"
```

The warning names whichever variable you actually set, so a `Https_Proxy` typo is caught too.

On **Windows** this does not apply — environment lookups are case-insensitive there, so `HTTPS_PROXY` is read and the clone *is* proxied. `pharn` does not print this warning on Windows.

### A proxy that is in force is announced

When `https_proxy` is set (or, on Windows, either spelling), `pharn` names it:

```text
⚠ The PHARN clone may be routed through http://***@proxy.internal:3128 (https_proxy).
  It reads no no_proxy/NO_PROXY, so proxy exclusions do not apply to it.
```

Two details in that message are deliberate:

- **"may be routed", not "was routed".** degit skips the download entirely when the commit's tarball is already in its cache (see [Overwrite declined](#overwrite-declined) for where that cache lives), and some failures fall back to a spawned `git clone` that never sees the proxy. `pharn` reports what degit **will read**, not which transport ran — it cannot observe that.
- **Credentials are redacted.** Any `user:password@` in the value is replaced with `***`. The value is only printed; it is never written to `pharn.config.json`, which lives in your repository and is committed.

`no_proxy` / `NO_PROXY` appear nowhere in degit, so an exclusion list that works for your other tools does **not** exempt this clone.

### Which degit versions this was measured against

`pharn` does not pin `degit` for you. It declares the **range** `^3.6.1`, and the published package
ships no lockfile, so `npm` resolves the version fresh when you install — today that is `3.8.0`.

Every published version in that range was checked, and all nine read only the lowercase name:

```text
3.6.1  3.6.2  3.6.3  3.6.4  3.6.5  3.6.6  3.7.0  3.7.1  3.8.0
```

`pharn` reads the version you actually have and only states the confident wording above when it is one
of those. On any other version it hedges instead, naming both what was measured and what you have:

```text
⚠ HTTPS_PROXY is set, and the PHARN clone will probably ignore it: every degit
  pharn has measured (3.6.1-3.8.0) reads only the lowercase https_proxy, but the
  installed degit is 3.9.0. Set https_proxy to the same value to be sure.
```

So a newer degit makes the notice more cautious, never wrong. If you see the hedged form, the
behavior has not necessarily changed — it just has not been verified for your version.

### Scope

These notices cover the **degit clone only**. `pharn` makes its own small HTTPS requests too (the commit SHA, and `SKILLS_VERSION` for `update` / `status --no-drift`); their proxy behavior is a separate question this documentation does not make a claim about. `status --no-drift` never clones, so it prints no proxy notice at all.

The notices are **advisory**: they report your environment against degit versions `pharn` has measured. They are not a guarantee about the connection that actually happened — `pharn` cannot observe that.

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
