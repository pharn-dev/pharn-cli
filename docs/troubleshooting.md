# Troubleshooting

## Exit codes

| Situation                                                                                               | Exit code |
| ------------------------------------------------------------------------------------------------------- | --------- |
| Prerequisite failure (no `.git`)                                                                        | 1         |
| Capability fetch / install failure                                                                      | 1         |
| Unknown command                                                                                         | 1         |
| Unknown option, or an unexpected extra argument                                                         | 1         |
| `add` / `update` / `remove` / `list` / `status` with no `pharn.config.json` (or a pre-archetype config) | 1         |
| `update` completed but skipped files it could not verify                                                | 0         |
| `update --force` aborted because a backup could not be written                                          | 1         |
| User cancel at summary, or overwrite declined                                                           | 0         |
| Successful install                                                                                      | 0         |

## Streams

Error-level messages go to **stderr**; normal output (notes, summaries, prompts, spinners, the
`Cancelled.` line) goes to **stdout**. So the two can be captured separately:

```bash
pharn update --yes > update.log 2> errors.log
```

On success, `pharn list --json` writes exactly one inventory object to stdout and nothing else, so
`pharn list --json | jq .` parses cleanly. On **any** failure — a missing config, a pre-archetype
config, or an argv refusal such as `pharn list --json --bogus` — stdout is **empty**, the diagnostic
goes to stderr, and the exit code is 1. So stdout is either one object or nothing; it is never a
half-written object or an error string.

Cancelling a prompt is a **success** (exit 0), not an error — its message stays on stdout.

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

`init` / `add` / `update` download `pharn-dev/pharn-oss` as a tarball from `codeload.github.com` (after resolving the branch head via `api.github.com`); `update` and `status --no-drift` also fetch the root `SKILLS_VERSION` from `raw.githubusercontent.com`. Check network access to all three hosts and that the repo is reachable. Note that `pharn` does not use a proxy — see [Proxy environment variables](#proxy-environment-variables).

A failure to reach the host names it, and includes the underlying diagnosis rather than the runtime's
bare `fetch failed`:

```text
⚠ Could not reach https://raw.githubusercontent.com/pharn-dev/pharn-oss/main/SKILLS_VERSION:
  fetch failed (getaddrinfo ENOTFOUND raw.githubusercontent.com)
Re-run with PHARN_DEBUG=1 for full error output.
```

A request that takes longer than 8 seconds is aborted and reported the same way. Failures that are
**not** transport failures keep their own wording — an HTTP status (`SKILLS_VERSION fetch failed
(404) from …`), an oversized body (`SKILLS_VERSION too large (… bytes)`), or an unusable value
(`SKILLS_VERSION has invalid format`) — so the message tells you which of the four happened.

## An upstream capability was skipped

Symptoms:

- A warning naming one or more capabilities: `… could not be read and … SKIPPED — not installed`
- `init` / `add` / `update` / `status` otherwise complete normally, exit 0

pharn always reads `pharn-dev/pharn-oss` at `main`, so upstream can change a capability into a shape
your installed pharn version does not understand yet. Rather than abort, pharn skips that **one**
capability, names it with the reason, and carries on — it will not install content it could not
validate.

- `update` keeps the capability's entry in `pharn.config.json` (reported as `KEPT`) but writes none
  of its files, and still bumps the skills version so a later `pharn add` is not blocked.
- `status` leaves it out of the drift comparison, so `--strict` does not fail on it.
- `add` cannot install it by name — it is not in the addressable set.

Fix: upgrade with `npm install -g @pharn-dev/pharn@latest`, or wait for upstream to finish the
change. If you no longer want the capability, `pharn remove <name>`.

## `pharn is too old for the current pharn-oss`

Symptoms:

- `⚠ This pharn is too old for the current github.com/pharn-dev/pharn-oss: it requires
  @pharn-dev/pharn vX.Y.Z or newer …`
- Exit code 1, nothing written, temporary clone cleaned up

pharn-oss ships an optional root `MIN_CLI` file declaring the minimum CLI version its content needs.
`init` / `add` / `update` check it before doing any work. Upgrade:

```bash
npm install -g @pharn-dev/pharn@latest
```

A `MIN_CLI` file that is absent, unreadable, or malformed imposes **no** constraint — only a
well-formed version newer than yours refuses.

## Install failed

Symptoms:

- Spinner stops with "Failed to install capabilities"
- Exit code 1

Causes include a fetch failure (network/GitHub), an archive `pharn` refused to extract (see `THREAT-MODEL.md` §2 for what the extractor rejects), or a selected capability missing at its expected path (`<subtree>/<name>/<name>.md`) in the fetched repo. Set `PHARN_DEBUG=1` and re-run for the full stack trace:

```bash
PHARN_DEBUG=1 npx @pharn-dev/pharn init
```

### When the `PHARN_DEBUG` hint appears

Every fatal error that came from an **exception** ends with
`Re-run with PHARN_DEBUG=1 for full error output.` — a failed clone, a failed `SKILLS_VERSION`
fetch, a copy that could not be completed. Re-running with the variable set prints the original
error (including its `cause`) instead of the hint.

A **policy refusal** deliberately prints no hint, because there is no stack behind it: the
`MIN_CLI` refusal, the `pharn add` version / layout gates, an unknown capability name, and the
non-interactive-terminal messages all name the one action that resolves them instead.

## Overwrite declined

If any install targets already exist and you decline the overwrite prompt, the wizard cancels with exit 0 and **nothing is written into your project** (the temporary clone is cleaned up).

Nothing is written outside your project either: the repo fetch runs first, but it downloads into a temporary directory that is removed on every path — success, cancel, and error alike. `pharn` keeps no download cache. (Earlier versions did, through `degit`; see [Proxy environment variables](#a-leftover-cache-you-may-want-to-delete) if you want to reclaim that space.)

## Proxy environment variables

**`pharn` does not use an HTTP proxy.** Every network call it makes — the commit-SHA resolve, the repo
tarball, and `SKILLS_VERSION` for `update` / `status --no-drift` — goes through Node's global `fetch`,
which reads **no** proxy environment variable: not `https_proxy`, not `HTTPS_PROXY`, not `no_proxy`,
on any platform. There is no spelling that works and no flag that changes it.

If a proxy variable is set, `pharn` says so **before** it fetches, so a network that blocks direct
egress produces an explanation rather than an unexplained timeout:

```text
⚠ HTTPS_PROXY is set (http://***@proxy.internal:3128), but pharn will not use it:
  its network calls go through Node's global fetch, which reads no proxy
  environment variable on any platform. The download connects DIRECTLY, and
  fails if direct egress is blocked (LIMITS.md §3a).
```

Two details in that message are deliberate:

- **It names the variable you actually set**, so a `Https_Proxy` typo shows up as read-and-still-unused
  rather than as "pharn did not see it".
- **Credentials are redacted.** Any `user:password@` in the value is replaced with `***`. The value is
  only printed; it is never written to `pharn.config.json`, which lives in your repository and is
  committed.

If you are behind a mandatory proxy, there is no workaround inside `pharn` today — this is a named
limit (`LIMITS.md` §3a), not a bug to report.

### This changed in the codeload release

Earlier versions cloned through `degit`, which read `process.env.https_proxy` **itself**. If you had
set exactly that lowercase spelling, your clone *was* proxied, and it no longer is. Your
`pharn update` and `status --no-drift` were already unproxied — those were always plain `fetch` — so
this makes one boundary consistent rather than newly broken, but it does break a setup that worked.

### A leftover cache you may want to delete

`pharn` no longer writes or reads a download cache: each fetch downloads into a fresh temp dir that is
always removed. But earlier versions cloned through `degit`, which persisted a commit-named `.tar.gz`
(~2.4 MB) plus `map.json`/`access.json` into a shared, cross-project cache directory on **every**
fetch — and **nothing ever reclaimed them**.

That is worth stating plainly, because the directory can be much larger than "one leftover download"
suggests. `degit` does have a deletion path, but it fires only when an existing **ref's** mapped hash
changes. `pharn` passed the resolved commit SHA *as* the ref, so every fetch wrote a self-mapped
`"<sha>": "<sha>"` entry under a **new key** — the previous hash for that key was always `undefined`,
so the delete branch could never run. One tarball accumulated per distinct upstream commit you ever
fetched, forever. A CI machine running `pharn status` on each upstream push could reach hundreds of
megabytes on an image nothing purges, and `pharn` printed nothing about it.

Check what is there, then delete the whole directory — `pharn` will not do it for you, and nothing
reads it any more:

| Platform | Path |
| -------- | ---- |
| macOS | `~/Library/Caches/degit` |
| Windows | `%LOCALAPPDATA%\degit` |
| Other | `$XDG_CACHE_HOME/degit`, else `~/.cache/degit` |

```bash
du -sh ~/Library/Caches/degit          # macOS
du -sh "${XDG_CACHE_HOME:-$HOME/.cache}/degit"   # Linux and other POSIX
```

The directory is shared with any other tool that uses `degit`, so if you use one, delete only
`degit/github/pharn-dev/pharn-oss` inside it rather than the whole tree.

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

## Unknown option, or an unexpected argument

```text
Unknown option: "--sctrict"

Usage: ...
```

```text
Unexpected argument: "extra"

Usage: ...
```

`pharn` refuses argv it does not understand rather than ignoring it, and refuses **before** running
any command — so nothing is fetched and nothing is written. Both messages go to stderr with the
usage text and exit **1**.

This matters most in CI: a mistyped `pharn status --sctrict` used to run in the default exit-0 mode,
so the drift gate was silently disarmed while every run stayed green. `pharn update --froce` used to
run un-forced, and `pharn add a11y extra` used to drop the third argument.

Two consequences worth knowing:

- A genuine `--help` or `--version` does **not** excuse an unknown sibling: `pharn --help --bogus`
  refuses instead of printing the usage text.
- Flags are parsed globally, so a flag that belongs to another command still parses and is ignored
  (`pharn init --force` is accepted and does nothing). Only *unrecognised* options are refused.

Run `pharn --help` for the full option list.

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
