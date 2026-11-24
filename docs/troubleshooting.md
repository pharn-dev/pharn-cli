# Troubleshooting

## Exit codes

| Situation                                                                                                                            | Exit code  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Successful run; `init --dry-run` or `update --dry-run` printed its plan (nothing written)                                            | 0          |
| User cancel at a prompt, or overwrite declined                                                                                       | 0          |
| `update` completed but skipped files it could not verify                                                                             | 0          |
| `update` on an install ahead of its source (newest release, or `main` after it moved back)                                           | 0          |
| `uninstall` with no `pharn.config.json` at all (nothing to uninstall)                                                                | 0          |
| Prerequisite failure (no `.git`, or `init` / `update` on a Node older than 24.2.0)                                                   | 1          |
| Capability fetch / install failure, or no verified pharn-oss release could be resolved                                               | 1          |
| The fetched version declares a `MIN_CLI` newer than the installed CLI                                                                | 1          |
| Unknown command, unknown or unsupported option, unexpected argument, invalid `--ref` value                                           | 1          |
| A value on an on/off option (`--json=false`), or `--ref` / `--archetype` given twice                                                 | 1          |
| `add` / `update` / `remove` / `list` / `status` with no `pharn.config.json` (or a pre-archetype config)                              | 1          |
| `status --strict` found a [strict condition](commands/status.md#strict-conditions)                                                   | 1          |
| A plain `init`, `update` or `uninstall` (no `--yes` / `--dry-run`) without an interactive terminal (and `add`/`remove` with no name) | 1          |
| `init --yes` in a project where a file it would write already exists (nothing written)                                               | 1          |
| Another `pharn` process holds the project lock (`pharn/.lock`)                                                                       | 1          |
| `add` refused on a skills-version mismatch                                                                                           | 1          |
| `update --force` aborted because a backup could not be written                                                                       | 1          |
| `uninstall` refused, or stopped part-way (see [`uninstall`](commands/uninstall.md))                                                  | 1          |
| Interrupted by Ctrl-C (`SIGINT`) or `SIGTERM` (a `timeout`, `docker stop`); the project may be partial                               | 130 or 143 |

## Common problems

| Symptom                                                     | See                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `update` listed files under `SKIPPED` or `held`             | [`pharn update` skipped my files](#pharn-update-skipped-my-files)                    |
| `Another pharn process is writing to this project`          | [Another pharn process is running](#another-pharn-process-is-running)                |
| `No pharn.config.json found. Run pharn init first.`         | [`add` / `update` say to run init first](#add--update-say-to-run-init-first)         |
| `Could not resolve the latest verified … release`           | [No verified release could be resolved](#no-verified-release-could-be-resolved)      |
| `Failed to fetch`, a timeout, or a proxy notice             | [Capabilities could not be fetched](#capabilities-could-not-be-fetched)              |
| `… outside the paths pharn installs; refusing this release` | [A pharn-oss release was refused](#a-pharn-oss-release-was-refused)                  |
| The wrong archetypes were detected                          | [Detection picked the wrong archetype](#detection-picked-the-wrong-archetype)        |
| `Unknown option` / ``Unsupported option for `<command>` ``  | [Unsupported option for this command](#unsupported-option-for-this-command)          |
| Your Prettier check fails on PHARN's files                  | [My Prettier check fails on PHARN's files](#my-prettier-check-fails-on-pharns-files) |

## Node version

The CLI and what it installs need **Node 24.2.0 or newer**. `pharn init` and `pharn update` check it first
(npm only warns about `engines.node`), and on an older Node, or one whose version cannot be read, print
`pharn init requires Node 24.2.0 or newer, and this is Node …` (or `pharn update …`), exit **1** and write nothing. `pharn status`
shows the floor in a `NODE` note and never fails over it; `add`, `remove`, `list` and `uninstall` do not check. The
installed checkers (`pharn/floor/*.mjs`) refuse to run on an older Node (one stderr line, exit **2**): if a
`/pharn-*` stage fails that way, check `node -v` where Claude Code runs your gates.

## Streams

Error-level messages, every fatal included, go to **stderr**; notes, summaries, prompts, spinners and
`Cancelled.` go to **stdout** (`pharn update --yes > update.log 2> errors.log`). A `--json` command prints
exactly one object on stdout, or nothing on a failure (exit 1); `status --json --strict` still prints its
report when it exits 1 (see [JSON output](reference/json-output.md)). Cancelling a prompt exits 0.

### Colour

Colour follows Node's own rule, the one `pharn`'s prompts use. With `FORCE_COLOR` set, it is on for `1`,
`2`, `3`, `true` or empty (even when piped) and off for `0` or `false`, and `NO_COLOR` is ignored. With it
unset, colour is on only on a colour-capable terminal, and `NO_COLOR`, `NODE_DISABLE_COLORS` or `TERM=dumb`
turn it off; `CI` alone turns nothing on. A piped CI log stays plain unless you set `FORCE_COLOR=1`.

## `pharn update` skipped my files

`update` skips a **present** PHARN-owned file it cannot prove is untouched (a missing one is restored):

- **`modified`**: you edited it after `pharn` wrote it.
- **`unrecorded`**: `pharn` has no record of writing that path.
- **`unverifiable`**: there is no usable `pharn.records.json` (absent, malformed, or from a newer schema; a
  stamp that disagrees with the config is fine, [why](reference/pharn-records.md#the-stamp-is-not-a-gate)).
- **`unreadable`**: a symlink, a directory, an unreadable file or a path under a symlinked parent sits
  there. `--force` cannot clear it (`--force cannot clear the UNREADABLE paths above.`): fix it by hand.

That is the designed outcome: exit **0**, and `skillsVersion` stays where it was, so `pharn status` keeps
showing an update. `pharn update --force` overwrites the first three, backing each up to
`pharn/.backup/<timestamp>/` first. See the [decision table](commands/update.md#the-decision-table).

### `update` held the floor, hooks and commands (`EXECUTABLE UNIT`)

The floor checkers, hooks and `pharn-*` commands run together, so a new skills version writes them all or
none. If one is skipped (an edited checker, a command whose `model:` line you changed), the rest are
**`held`** at your version, named in an `EXECUTABLE UNIT` note, exit 0. Revert the blockers and re-run, or
use `--force`. See [the executable unit](reference/update-advanced.md#the-executable-unit-is-upgraded-all-or-none).

### `--force` aborted with a backup error

The backup completes before any original is touched, so **nothing was overwritten**. A regular file named
`pharn/.backup` or `pharn` blocks the backup directory: move or rename it (do not delete it before checking you do not need it), then re-run. A symlink at either
path, or in a source file's path, is refused (the error names it): replace it, then re-run.

### `add`, `remove`, `update` and `init` write backups too

`add` backs up every destination file that **differs** from the clone before it copies, and refuses (exit 1,
nothing written) when a destination crosses a symlinked directory, naming it:
``⚠ Refusing to add a11y: `pharn/pharn-pipeline/grillers/a11y/evals` in your project is a symlink.``
(the copy would write through it): replace it with a real directory, or move it aside.
`remove`, `update` and a re-run `init` back up every file of a capability directory they delete that is not
recorded at its current hash ([remove](commands/remove.md#what-is-backed-up-before-the-delete),
[update](commands/update.md#dropped-capabilities-are-deleted), [init](commands/init.md#dropped-capabilities-are-deleted)).
A failed backup deletes and writes nothing.

## My Prettier check fails on PHARN's files

`pharn` copies pharn-oss's files as pharn-oss formats them. In a project that uses Prettier, `init` and
`update` add the lines that keep your check off them to `.prettierignore`
([how](commands/init.md#prettierignore)); `pharn status` shows a `PRETTIER` note when lines are missing, and
any `pharn update` adds them. If the check still fails, your Prettier setup may not be visible at the root
(a package config, `--ignore-path`): copy the lines from `pharn update --dry-run` into the file your check
reads. Already ran `prettier --write` over them? Once the lines are in, `pharn update --force` puts
pharn-oss's bytes back, backing up yours. If `pharn` could not write `.prettierignore`, add the lines it lists.

## Line endings (Windows, `core.autocrlf`)

With `core.autocrlf=true`, git checks installed text files out with CRLF. Every comparison `pharn` makes
(`status` drift, the `update` decision, the `add`/`init` backup scans, the `remove` backup set, what
`uninstall` may delete, the [records](reference/pharn-records.md)) hashes a **text** file with each `\r\n`
folded to `\n`, so a CRLF checkout of untouched files shows no drift. A file with a NUL byte in its first
8000 bytes is binary and compared byte for byte; a lone `\r` still counts as a change; `pharn` writes
upstream's LF bytes and does not convert a CRLF file that is already up to date. **The cost:** an edit that
only changes line endings is invisible, so `update`, `add`, `remove` or `uninstall` may replace or delete
such a file without a backup. A record store written before this rule stays valid (a file without `\r\n`
hashes the same). It is tested with a real `git -c core.autocrlf=true` checkout on Linux; CI does not run
on Windows ([Contributing](contributing.md)).

## Prerequisites failed

`pharn init` needs Node >= 24.2.0 ([above](#node-version)), a git repository and, for a plain run, an
interactive terminal. Off a TTY a plain `init`, `update` or `uninstall` **exits 1**; use `update --yes`
(or `uninstall --yes`) in CI.
`init --yes` installs only where none of its files exists yet: wherever it would overwrite it exits 1,
lists the files and points at `pharn init` in a terminal, `--dry-run` or `pharn update`; on a re-install it
refuses before downloading, naming only `pharn.config.json`. `init --dry-run` and `update --dry-run` need no terminal.

### Git not found

The check is for a **`.git` directory** here, not the `git` binary (stderr, exit **1**):

```text
■ git not found.
  Run: git init && git add -A && git commit -m 'init'
  Then re-run: npx @pharn-dev/pharn init
```

Inside a repository but not at its root (a monorepo's `apps/web`), `init` says
`/home/me/mono/apps/web is inside the git repository at /home/me/mono, not at its root.` and asks you to run
it from there. That parent is found by its `.git` alone; if it is not your project's (a dotfiles repository
in your home directory), create a repository here with the `git init` line above.

### My Python / Go / Rust project detected as `lib`

That is correct: detection is **JS/TS-shaped**, so a project without a root `package.json` resolves to
`lib` and gets the **universal** capabilities (one **with** a root `package.json` can resolve `backend` from
its migrations). Add others with [`pharn add`](commands/add.md) or pass
[`--archetype`](#detection-picked-the-wrong-archetype). Rules: [Detect archetypes](commands/init.md#3-detect-archetypes).

### Detection picked the wrong archetype

The summary shows what triggered each archetype (`backend ← src/app/api/`). Re-run with the ones you want,
`pharn init --archetype spa` or `--archetype ssr,backend`: it replaces detection (shown as `(not used)`) and
is recorded, so `update` keeps it. A later `init` detects again unless you pass it, and prints
`previously recorded: … — pass --archetype … to keep them` when the result differs
([details](commands/init.md#choosing-the-archetypes-yourself---archetype)). The usual surprises: a server or
database package counts only under `dependencies` (a backend bundled as a devDependency needs
`--archetype backend`), while SSR frameworks count under `devDependencies` too. Every rule is in
[Detect archetypes](commands/init.md#3-detect-archetypes); for one capability, use `pharn add` / `pharn remove`.

### Detection stopped early

`detection stopped early: it examines at most 50,000 entries, 24 directories deep, …` (`--dry-run --json`:
`"detectionTruncated": true`) means the scan hit a bound before its result settled. It visits names in
sorted order, so a huge folder that sorts early (`public/`) can use the budget before `src/`. Check the
archetypes and pass [`--archetype`](#detection-picked-the-wrong-archetype) if they are wrong.

### Monorepos / workspaces

Run `pharn init` from the directory that holds both `.git` and the app's `package.json`. It does not read
the workspace packages' own `package.json` files, and split layouts (`.git` at the root, the app in
`apps/web/`) are unsupported. What it sees in `apps/` and `packages/`: [Detect archetypes](commands/init.md#3-detect-archetypes).

## Overwrite warnings

Not an error. Before installing, `pharn init` lists which of its write targets already exist (the paths in
[What you get](getting-started.md#what-you-get), except `pharn.records.json`) and asks; the default is **no**,
and cancelling exits 0. `.claude/settings.json` is never overwritten, so it never appears. A long list is
capped at 10, with the files `init` backs up first marked `(edited)`, `(no pharn record)` or
`(differs from upstream)` ([details](commands/init.md#6-summary)).

## Capabilities could not be fetched

Symptoms: "Failed to fetch PHARN" / "Failed to fetch capabilities", naming `github.com/pharn-dev/pharn-oss`,
exit 1. `pharn` resolves the commit via `api.github.com` and downloads it from `codeload.github.com`; on the
`main` channel, `update` and `status --no-drift` read `SKILLS_VERSION` from `raw.githubusercontent.com`
instead. Check access to all three, and note that `pharn` uses a proxy only when you
[opt in](#proxy-environment-variables). A transport failure names the host and its cause:

```text
⚠ Could not reach https://raw.githubusercontent.com/pharn-dev/pharn-oss/main/SKILLS_VERSION:
  fetch failed (getaddrinfo ENOTFOUND raw.githubusercontent.com)
Re-run with PHARN_DEBUG=1 for full error output.
```

Metadata requests abort after 8 seconds, the download after 60, reported the same way. Other failures say what happened: an HTTP
status (`SKILLS_VERSION fetch failed (404) from …`), an oversized body (`SKILLS_VERSION too large (… bytes)`)
or a bad value (`SKILLS_VERSION has invalid format`).

## No verified release could be resolved

An install that follows releases (a new `pharn init`, or `"ref": "latest"`) stops with exit 1 and
`⚠ Could not resolve the latest verified pharn-dev/pharn-oss release: <reason>. …`, naming `--ref main`. It
installs only the newest pharn-oss **GitHub release**, never the tip of `main`. The reason:

- **`has published no release yet (HTTP 404 …)`**: use `--ref main`, or wait.
- **`GitHub refused the request (HTTP 403 …)` / `(HTTP 429 …)`**: the unauthenticated API allows 60 requests
  an hour per address, shared by your network (CI runners share one too). `pharn` takes no token: retry
  later, run the step less often, or use `--ref main`, whose commit resolve degrades instead of failing.
- **`could not reach …`**: a network failure or the 8-second limit ([proxy](#proxy-environment-variables)).
- **`… is not a plain vX.Y.Z version`**, **`marked draft` / `prerelease`**: not a release `pharn` accepts.

A release whose tree carries another `SKILLS_VERSION` than its tag is refused too
(`Release vX.Y.Z (…) ships SKILLS_VERSION …`). `pharn update --ref main` moves an install to `main`.

## A pharn-oss release was refused

```text
⚠ pharn-oss's pharn-install.json files[N] would write pharn/floor/.eslintrc.json, outside the paths pharn
  installs; refusing this release. This is a problem in the pharn-oss release, not in your project: …
```

`init`, `add`, `update` and `status` exit 1 when the fetched release's install manifest names a file outside
the paths `pharn` installs into. `pharn` refuses the whole release, so nothing in your project is changed and an
existing install keeps working as it is. Upgrading `pharn` does not help: the path is wrong in pharn-oss. Report it
at the [pharn-oss issues](https://github.com/pharn-dev/pharn-oss/issues). Once pharn-oss has fixed `main`, move to it
with `pharn update --ref main` (`pharn init --ref main` for a new install), or wait for the next release; `add`
and `status` follow the channel your config records, so they work again after that.

## An upstream capability was skipped

`… could not be read and … SKIPPED — not installed`, exit 0: upstream changed a capability into a shape your
`pharn` does not understand yet, so it skips that **one** and carries on. `update` keeps its entry (`KEPT`)
and writes none of its files ([details](reference/update-advanced.md#when-pharn-cannot-read-a-capability-upstream)),
`status` leaves it out of drift, and `add` cannot install it. Upgrade (`npm install -g @pharn-dev/pharn@latest`),
wait for upstream, or `pharn remove <name>`.

## `pharn is too old for the current pharn-oss`

```text
⚠ This pharn is too old for the current github.com/pharn-dev/pharn-oss: it requires
  @pharn-dev/pharn v0.9.0 or newer, and v0.4.0 is installed. Upgrade …, then re-run
  this command. Nothing was written.
```

pharn-oss can ship a root `MIN_CLI` file naming the minimum CLI its content needs; `init`, `add` and
`update` refuse below it, before writing anything (exit 1). Upgrade with `npm install -g @pharn-dev/pharn@latest`.
A `MIN_CLI` that is absent, unreadable or malformed imposes no constraint.

## `pharn.config.json` was written by a newer `pharn`

`pharn.config.json was written by pharn X.Y.Z; this is pharn A.B.C. Upgrade pharn …` (stderr; the command
carries on, exit code and `--json` output unchanged) means a teammate or CI runs a newer `pharn` (major.minor).
An older `update` or `init` installs by its older rules and stamps its own version, so the warning stops
without anything being fixed. Upgrade, and pin one version for the team (a `devDependency`). A patch
difference or a missing or malformed `pharnVersion` never warns ([support policy](support-policy.md#teammates-on-different-pharn-versions)).

## Install failed

"Failed to install capabilities", exit 1: a fetch failure, an archive `pharn` refused to extract, or a
selected capability missing in the fetched repo (`Capability "<name>" (<role>) is missing at
<subtree>/<name> in the fetched repo.`; one whose `<name>.md` is absent is refused earlier, at the index
parse). What the extractor rejects is in `THREAT-MODEL.md` §2. `PHARN_DEBUG=1 npx @pharn-dev/pharn init` shows the full error.

### Something in your project is in the way

```text
Refusing to install: .claude/commands/pharn-plan.md is in the way — pharn needs a file where you have
a directory, or a directory where you have a file. Nothing was written.
```

`init` checks every path before it asks and again before its first write. An entry of the wrong kind (a
directory named `pharn.config.json`, or a file named `features` when pharn-oss ships
`pharn/features/README.md`) stops it, naming up to five, with nothing written: move them and re-run. A
**symbolic link** on the way is refused the same way (`… is a symbolic link inside the project, so writing
through it would put files OUTSIDE the project.`, or `… is a symbolic link where pharn writes a file`): replace
it with a real directory or file. A
`.claude/settings.json` link is fine while its target exists, since `init` never overwrites that file.

### When the `PHARN_DEBUG` hint appears

A fatal error from an **exception** (a failed download, a copy that could not finish, an internal error)
prints `⚠ <message>` and `Re-run with PHARN_DEBUG=1 for full error output.` (exit 1); with the variable set
it prints the error, its `cause` and stack. A **policy refusal** (`MIN_CLI`, the `add` version gate, an
unknown capability, the no-terminal messages) has no hint: it names the action that resolves it.

## Overwrite declined

Declining exits 0 with **nothing written**, in your project or outside it: the download goes to a temporary
directory removed on every path, and `pharn` keeps no cache.

## Proxy environment variables

**By default `pharn` uses no HTTP proxy**: its calls go through Node's global `fetch`, which reads no proxy
variable unless you opt in. On Node 22.21+ and 24.5+, set `NODE_USE_ENV_PROXY=1` (only `1`) or pass
`--use-env-proxy` (for example in `NODE_OPTIONS`); `fetch` then uses the proxy and honours `NO_PROXY`. The
flag beats the variable and the last flag wins (`--no-use-env-proxy` turns it off; `-` or `_` both work).
Node 24.0–24.4 has no flag, but any non-empty `NODE_USE_ENV_PROXY` opts in. Node 20, 21, 22.0–22.20 and 23
have no opt-in, so behind a mandatory proxy there is no workaround (a named limit, `LIMITS.md` §3a).

Node reads `https_proxy`, then `HTTPS_PROXY`, then `http_proxy`, then `HTTP_PROXY` for `pharn`'s https URLs;
it stops at the first one present, so an empty `https_proxy` hides `HTTPS_PROXY`. Only those four spellings
count on Linux and macOS (any spelling on Windows). When one is set, `pharn` says before it fetches whether
it will use it (`⚠ HTTPS_PROXY is set (http://***@proxy.internal:3128), but pharn will not use it: …`,
naming `NODE_USE_ENV_PROXY=1` when your Node supports it, or that `--no-use-env-proxy` turned it off; with
the opt-in on, that downloads go through the proxy; on a Node without one, which versions have it). A spelling
Node never reads gets its own notice naming the four that work. Credentials are shown as `***` and never written to
`pharn.config.json`.

### A leftover cache you may want to delete

`pharn` keeps no download cache, but versions before the codeload download used `degit`, which kept a
~2.4 MB `.tar.gz` per upstream commit (plus `map.json`/`access.json`) in a shared cache nothing reclaims.
Nothing reads it now; check its size (`du -sh`) and delete it, or only `degit/github/pharn-dev/pharn-oss`
inside it if another tool uses `degit`:

| Platform | Path                                           |
| -------- | ---------------------------------------------- |
| macOS    | `~/Library/Caches/degit`                       |
| Windows  | `%LOCALAPPDATA%\degit`                         |
| Other    | `$XDG_CACHE_HOME/degit`, else `~/.cache/degit` |

## Another pharn process is running

```text
■  Another pharn process is writing to this project: pharn update (pid 4821 on my-laptop,
   since 2026-09-08T20:14:03.117Z). It may be waiting for input in another terminal.
   Wait for it to finish, or delete pharn/.lock if you are sure no pharn process is running.
```

`init`, `add`, `remove`, `update` and `uninstall` hold [the project lock](reference/project-lock.md),
`pharn/.lock`, from before they read the config to their last write, across their prompts. A second writer
refuses (exit 1, nothing read, fetched or written). Look for a `pharn` command waiting for an answer in
another terminal, and answer or cancel it (Ctrl-C releases the lock). `--dry-run`, `list` and `status`
never take the lock.

### If the lock outlives its owner

A run that is `SIGKILL`ed, loses power or is ended by a hangup cannot release the lock. `pharn` breaks a
stale one by itself (a dead pid on this host, a lock from before the last boot, one from another host over
six hours old, a malformed one); the rules and their residuals, and the stray `pharn/.lock` directory or
`pharn/.lock.<pid>.<hex>` file, are in [If the lock outlives its owner](reference/project-lock.md#if-the-lock-outlives-its-owner).
If you are certain no `pharn` is running, deleting `pharn/.lock` is safe.

## `add` / `update` say to run init first

```text
No pharn.config.json found. Run `pharn init` first.
```

The file is **not there**, or cannot be read as a config at all (not a regular file, unopenable or over
16 MiB, not a JSON object, no string `skillsVersion`, neither `capabilities` nor `modules`). Invalid JSON and
invalid fields get [their own errors](#a-command-rejects-an-invalid-config-does-not-say-run-init). If the
file **is** there, look at it first: `init` **overwrites** it, dropping your recorded capabilities and manual
`pharn add` provenance (its summary says `the previous pharn.config.json could not be read (<reason>); …`
and its prompt defaults to No). Keep a copy with `mv pharn.config.json pharn.config.json.bak`.

### Legacy (pre-archetype) config

``This project uses the legacy module layout (pre-archetype), which is no longer supported. Re-run `pharn init` …``
means a config with `modules` but no `capabilities`: re-run `pharn init`. A config at the removed `flat`
layout gets [its own message](reference/update-advanced.md#an-install-recorded-at-the-flat-layout).

## A command rejects an invalid config (does NOT say "run init")

```text
pharn.config.json: capabilities[1].source must be "auto" or "manual" (found "guess"). Fix it by hand, or delete the field — an absent `source` is valid and the next `pharn update` will set it.
```

A hand-edited invalid field (`capabilities` not an array or with a bad entry, unknown `archetypes`, a
`skillsVersion` or `commit` that is not a version / full SHA / `null`) makes `add`, `status`, `update`,
`remove` and `list` name it and exit 1 ([fields](reference/pharn-config.md#skillsversion-and-commit--checked-when-the-config-loads)).
Fix it by hand. The `models` and `seam` blocks are pharn-oss's and never refused
([`models`](#pharn-status-lists-a-problem-with-models)).

### The config is not valid JSON

``… pharn.config.json is not valid JSON (line 4, column 1). The file exists — fix its syntax by hand. Do NOT run `pharn init` …``
names the line and column (most often a trailing comma). Fix it there. **Do not reach for `pharn init`**: it
rewrites the file (your `models` edits, `testResults` and `seam` are lost, and every capability becomes
`source: "auto"`, losing which ones you added by hand). Beyond repair? `mv pharn.config.json pharn.config.json.bak`,
run `pharn init`, copy your `models` / `seam` blocks back, and re-add manual capabilities with `pharn add`.

## `pharn status` lists a problem with `models`

`pharn-oss's rules reject this block:` followed by the reasons. The block is pharn-oss's
([Models](reference/pharn-config.md#models)), so nothing refuses over it; fix it by hand
(`node pharn/floor/check-model-config.mjs validate` says the same). An old-format block (a top-level
`default`, ids such as `opus-4-8`) is kept by `update`: replace it, or delete the `models` key so the next
`update` writes pharn-oss's. A stage, alias or effort newer than your `pharn` needs an upgrade. Values that
differ from the commands' frontmatter are not an error (`… check-model-config.mjs agreement` lists them):
`/pharn-ship` and `/pharn-loop` read the block's **model** for the stages they route, a `/pharn-<stage>` run
directly uses its frontmatter, and editing that frontmatter makes the file `modified`
([details](reference/update-advanced.md#the-models-block)).

## Unknown command

`Unknown command: ...`: the commands are `init`, `add`, `remove` (alias `rm`), `update`, `list`, `status`
and `uninstall`. `pharn <command> --help` shows one command and the options it takes.

## Unknown option, or an unexpected argument

`Unknown option: "--sctrict"` or `Unexpected argument: "extra"`, then ``Run `pharn --help` for usage.``, exit
**1**, before any command runs, so nothing is fetched or written (a mistyped `--strict` in CI fails instead of
running unarmed). A `--help` or `--version` does not excuse a bad sibling: `pharn --help --bogus` refuses.

## Unsupported option for this command

```text
Unsupported option for `status`: "--force"
Run `pharn --help` for usage.
```

An option the command does not take exits **1** like an unknown one (labelled differently, so you do not
hunt for a typo):

| command         | options it accepts                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `init`          | `--ref`, `--dry-run`, `--json` (implies `--dry-run`), `--yes` / `-y`, `--archetype <list>`                      |
| `add`           | none                                                                                                            |
| `remove` / `rm` | none                                                                                                            |
| `update`        | `--force`, `--yes` / `-y`, `--ref`, `--dry-run`, `--json` (implies `--dry-run`), `--compact` (implies `--json`) |
| `list`          | `--json`                                                                                                        |
| `status`        | `--strict`, `--no-drift`, `--json`                                                                              |
| `uninstall`     | `--yes` / `-y`                                                                                                  |
| _any_           | `--help` / `-h`, `--version` / `-v`                                                                             |

`init` is the default command, so a bare `pharn --json` is `pharn init --dry-run --json`. An on/off option
takes no value (`Option takes no value: "--json=false"`), `--ref` and `--archetype` may each be given once
(`Repeated option: "--ref"`), and `--no-drift` is the only negated option (`--no-dry-run`, `--no-yes` and `--no-ref` are `Unknown option`).

## Removing PHARN by hand

[`pharn uninstall`](commands/uninstall.md) removes PHARN whenever `pharn.records.json` is usable. Without
one, nothing can be proven to be `pharn`'s, so **review each path before deleting it**:

1. **Find what the install added**: `git log --diff-filter=A -- pharn.config.json`, then
   `git show --stat <commit>`; `git diff <commit> -- <path>` shows whether you changed a file since.
2. **Delete the installed surfaces** in [What you get](getting-started.md#what-you-get) (the `pharn-*.md`
   commands only, not `pharn-dev-*` or your own; the hooks and agents PHARN installed). Keep your
   `pharn/features/<feature>/` folders, `pharn/memory-bank/` and `pharn/spec-template.md`. A pharn-oss older
   than 7.0.0 left `THREAT-MODEL.md` and `LIMITS.md` at the root; a former `flat` install the same surfaces
   at the root (`.dev/floor/`, `features/README.md`, `PHARN-LICENSE`).
3. **Unwire the hooks** in `.claude/settings.json` (and `.claude/settings.local.json`) that run a deleted
   script; delete `settings.json` if `pharn init` created it and you never added to it.
4. **Delete** `pharn.config.json`, `pharn.records.json`, `pharn/.lock` (no `pharn` running), and, when you no
   longer need them, `pharn/.run/` (`.pharn/` before pharn-oss 7.0.0) and `pharn/.backup/`.

## Local development issues

`pharn` not found after editing the CLI: `npm run build:install-local`. Type errors in tests:
`npm run typecheck`. Stale dist: `npm run build`. See [Contributing](../CONTRIBUTING.md).

## Related

[Getting started](getting-started.md) · [init](commands/init.md) · [update](commands/update.md) ·
[update: less common situations](reference/update-advanced.md) · [The project lock](reference/project-lock.md) · [pharn.config.json](reference/pharn-config.md)
