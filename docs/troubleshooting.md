# Troubleshooting

## Exit codes

| Situation                                                                                               | Exit code |
| ------------------------------------------------------------------------------------------------------- | --------- |
| Prerequisite failure (no `.git`)                                                                        | 1         |
| Capability fetch / install failure                                                                      | 1         |
| Unknown command                                                                                         | 1         |
| Unknown option, an option the command does not take, or an unexpected extra argument                    | 1         |
| `add` / `update` / `remove` / `list` / `status` with no `pharn.config.json` (or a pre-archetype config) | 1         |
| `status --strict` found anything outdated, modified, missing or unreadable                              | 1         |
| `init` or `update` run without an interactive terminal (and `add`/`remove` with no name)                | 1         |
| Another `pharn` process holds the project lock (`.pharn.lock`)                                          | 1         |
| The fetched version declares a `MIN_CLI` newer than the installed CLI                                   | 1         |
| `add` refused on a skills-version or layout mismatch                                                    | 1         |
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

**One exception.** The missing-`.git` prerequisite failure is rendered through the same cancel
formatter as those success messages, so it prints on **stdout** while the process still exits 1. If
you are gating on stderr alone, check the exit code too.

## `pharn update` skipped my files

By default, `update` skips **present** PHARN-owned files it cannot prove are untouched (missing
expected files are still restored). It prints each skipped file under one of four labels:

- **`modified`** — you edited it after `pharn` wrote it.
- **`unrecorded`** — `pharn` has no record of writing that path.
- **`unverifiable`** — there is no usable `pharn.records.json` (absent, malformed, stamp-mismatched,
  or from a newer schema), so present differences cannot be proven. Every install created before
  `pharn` 0.4.0 hits this once for differing files; **missing** files are still restored.
- **`unreadable`** — something that is not a regular readable file sits at the expected path (a
  symlink, a directory, an unreadable file, or a path under a symlinked parent). This is the one
  bucket `--force` **cannot** clear; the run says so explicitly. Fix the path by hand.

Exit code is **0** — this is the designed outcome, not a failure. To overwrite them anyway:

```bash
pharn update --force   # backs up each skipped file to .pharn-backup/<timestamp>/, then overwrites
```

Files already byte-identical to upstream are left alone (`ok`). `--force` overwrites the `modified`,
`unrecorded` and `unverifiable` buckets only — `unreadable` paths are refused with
`--force cannot clear the UNREADABLE paths above.` and must be fixed by hand.

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

### `add` writes backups too

`.pharn-backup/<timestamp>/` is not only an `update --force` artefact. Before `pharn add` copies a
capability, it compares each destination file against the clone and copies every one that **differs**
into the same backup directory — so re-adding a capability whose files you edited never loses those
edits. Byte-identical files are not drift and are not backed up. Everything in
[`--force` aborted with a backup error](#--force-aborted-with-a-backup-error) applies to `add`
verbatim, including the abort-with-nothing-touched contract.

`add` also **refuses outright** — writing nothing, exit 1 — when a destination path crosses a
symlinked directory, naming the offending component:

```text
⚠ Refusing to add a11y: `pharn/pharn-pipeline/grillers/a11y/evals` in your project is a symlink.
```

That is deliberate rather than defensive: the copy would write straight through the link and replace
bytes outside your project, while the backup could not save them. Replace the symlink with a real
directory (or move it aside) and re-run.

## Prerequisites failed

`pharn init` has three prerequisites — a git repository, an interactive terminal, and Node >= 20.
There is no stack-pack or package prerequisite: archetype detection reads `package.json` names and the
file tree, and installs whatever capabilities apply.

Off a TTY, `init` and `update` **exit 1** rather than prompting into a dead stream; `update --yes` is
the supported way through in CI, and `init` deliberately has no `--yes`.

### Git not found

The CLI message says "git not found" but the check is for a **`.git` directory**, not the `git` binary:

```text
✗ git not found.
  Run: git init && git add -A && git commit -m 'init'
  Then re-run: npx @pharn-dev/pharn init
```

Exits with code **1**.

### My Python / Go / Rust project detected as `lib`

That is the correct outcome, not a failure. Archetype detection is **JS/TS-shaped**: the signals are
`package.json` dependency names plus `next.config.*`, `app/` route handlers, `.tsx`/`.jsx`,
`migrations/` and `.sql`. A repo with none of those produces no signal and resolves to `lib`, which
installs the **universal** capabilities — the ones that apply to any codebase. Use
[`pharn add`](commands/add.md) to install any others you want.

### Monorepos / workspaces

`pharn init` checks the **current directory** for a `.git` directory, reads the `package.json` there and runs a bounded, symlink-safe file-tree scan from it for archetype detection, then installs into that directory. The scan skips heavy or generated trees (`node_modules`, `dist`, `build`, `.next`, `out`, `coverage`, framework caches), so in a workspace it still sees `apps/` and `packages/`. It does not walk up to a workspace root or into workspace packages. In a monorepo, run it from the directory that contains both `.git` and the app's `package.json`. Split layouts (`.git` at the root, the app's `package.json` in `apps/web/`) are unsupported in v1.

## Overwrite warnings

Not an error. Just before installing, `pharn init` lists which of its actual write targets already
exist in your project (capability dirs, product commands/hooks, contracts, `pharn-core`, floor
checkers, all four trusted docs, pharn's `LICENSE` copy, the root `features/README.md`, and
`pharn.config.json`) and asks you to confirm before overwriting. Confirm to continue
or cancel to exit cleanly (code 0); the default is **no**.

- If **nothing** conflicts, there is no prompt at all.
- `.claude/settings.json` is never overwritten, so it never triggers the warning.
- On a re-install the list is long, so it is capped (first 10 shown, then "…and N more").

## Capabilities could not be fetched

Symptoms:

- Spinner stops with "Failed to fetch PHARN" / "Failed to fetch capabilities"
- Message references `github.com/pharn-dev/pharn-oss`
- Exit code 1

`init` / `add` / `update` / `status` download `pharn-dev/pharn-oss` as a tarball from `codeload.github.com` (after resolving the branch head via `api.github.com`) — default `status` clones too, and reads `SKILLS_VERSION` out of that clone. `update` and `status --no-drift` instead fetch the root `SKILLS_VERSION` from `raw.githubusercontent.com` without cloning. Check network access to all three hosts and that the repo is reachable. Note that `pharn` does not use a proxy — see [Proxy environment variables](#proxy-environment-variables).

A failure to reach the host names it, and includes the underlying diagnosis rather than the runtime's
bare `fetch failed`:

```text
⚠ Could not reach https://raw.githubusercontent.com/pharn-dev/pharn-oss/main/SKILLS_VERSION:
  fetch failed (getaddrinfo ENOTFOUND raw.githubusercontent.com)
Re-run with PHARN_DEBUG=1 for full error output.
```

The two metadata requests (the branch-head resolve and the `SKILLS_VERSION` fetch) abort after 8 seconds; the repo download has its own, longer cap of 60 seconds. An aborted request is reported the same way. Failures that are
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

Causes include a fetch failure (network/GitHub), an archive `pharn` refused to extract (see `THREAT-MODEL.md` §2 for what the extractor rejects), or a selected capability directory missing at its expected path (`<subtree>/<name>`) in the fetched repo — the pre-flight checks the directory, and reports `Capability "<name>" (<role>) is missing at <subtree>/<name> in the fetched repo.` (A capability whose `<name>.md` is absent is refused earlier, during the index parse, under a different message.) Set `PHARN_DEBUG=1` and re-run for the full stack trace:

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

Nothing is written outside your project either: the repo fetch runs first, but it downloads into a temporary directory that is removed on every path — success, cancel, and error alike. `pharn` keeps no download cache. (Earlier versions did, through `degit`; see [A leftover cache you may want to delete](#a-leftover-cache-you-may-want-to-delete) if you want to reclaim that space.)

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

## Another pharn process is running

`init`, `add`, `remove` and `update` take a single-writer lock on the project before they write
anything, and refuse rather than queue:

```text
■  Another pharn process is writing to this project: pharn update (pid 4821 on my-laptop,
   since 2026-09-08T20:14:03.117Z).
   Wait for it to finish, or delete .pharn.lock if you are sure no pharn process is running.
```

Exit code 1, and **nothing is written**.

This exists because two concurrent runs do not merely race on a file — they corrupt the drift
baseline. Process A overwrites a file; process B, which planned against the pre-A snapshot,
overwrites it again and records its own hash; A then persists its records and config last, recording
a hash for bytes B replaced. `pharn.records.json` then disagrees with disk **under a matching stamp**,
which is exactly the state the stamp check exists to catch — so `update` loses its ability to tell
"pharn wrote this" from "you edited this".

**`list` and `status` are never blocked and never take the lock**, so `pharn status --strict` stays
runnable in CI while an update is in flight.

### If the lock outlives its owner

`init` is the one command that can hold the lock for a long time on purpose: it takes the lock after
both of its prompts, but the picker and the overwrite confirmation are answered by a human, so a
walked-away `init` can block other writers in that project until the six-hour staleness window
expires. `add`'s picker holds it across the multi-select for the same reason.

A run that is `SIGKILL`ed or loses power cannot release. `pharn` breaks such a lock by itself when
any of these hold:

- the file is missing, unreadable, or not a well-formed lock payload;
- it is more than six hours old;
- it names a pid on **this** host that is no longer running.

A lock from **another host** is only retired by age — a pid means nothing across machines. If you are
certain nothing is running, deleting `.pharn.lock` is safe and is the documented escape.

## `add` / `update` say to run init first

```text
No pharn.config.json found. Run `pharn init` first.
```

All non-`init` commands operate on an already-installed project. Run `pharn init` to create `pharn.config.json`.

This message means the file is genuinely **not there** (or cannot be read at all). A
`pharn.config.json` that exists but is broken never produces it — see
[the corrupt-config case](#a-command-rejects-an-invalid-config-does-not-say-run-init) below. That
distinction matters: `pharn init` **overwrites** the config, so being told to run it about a file
that is sitting right there would cost you your recorded capabilities and manual `pharn add`
provenance.

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

### The config is not valid JSON

```text
/path/to/your/project/pharn.config.json is not valid JSON (line 4, column 1). The file exists — fix its syntax by hand. Do NOT run `pharn init` to clear it: init OVERWRITES this config, discarding your recorded capabilities, any manual `pharn add` provenance, and hand-edited models/seam blocks. If it is beyond repair, move it aside first (`mv pharn.config.json pharn.config.json.bak`), then run `pharn init`.
```

A syntax error — most often a trailing comma — is reported with the file's full path and, when the
JSON parser supplies one, the **line and column** of the offending byte. Open the file at that
position and fix it; nothing else is needed, and nothing has been written.

**Do not reach for `pharn init` here.** It rewrites `pharn.config.json` wholesale: hand-edited
`models` / `seam` blocks go back to defaults and every capability is re-stamped `source: "auto"`,
which discards the record of which capabilities you added by hand with `pharn add`. That record
lives nowhere else, and `pharn update` reads it to keep your manual additions across upgrades.

If the file is genuinely beyond repair, move it out of the way first so you can still read it, then
re-install:

```bash
mv pharn.config.json pharn.config.json.bak
pharn init
```

You can then copy your `models` / `seam` blocks back out of the `.bak` file, and re-add anything you
had installed manually with `pharn add <name>`.

Two neighbouring cases are deliberately **not** reported this way, because the file is not readable
in the first place: a config that is **absent**, or one that exists but cannot be read at all (a
permissions problem, or a directory sitting at that path), still says
[`No pharn.config.json found`](#add--update-say-to-run-init-first).

## Unknown command

```text
Unknown command: ...
```

Run `pharn --help`. Valid commands: `init`, `add`, `remove` (alias `rm`), `update`, `list`, `status`.

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

- A genuine `--help` or `--version` does **not** excuse a bad sibling — neither an unrecognised one
  nor one this command does not take: `pharn --help --bogus` and `pharn status --help --json` both
  refuse instead of printing the usage text. `pharn status --help` on its own is unaffected.
- Options are **scoped to one command**, and passing one to a different command is an error, not a
  no-op — see the next section.

Run `pharn --help` for the full option list.

## Unsupported option for this command

```text
Unsupported option for `status`: "--json"

Usage: ...
```

Every option belongs to exactly one command, and `pharn` refuses the ones a command does not take:

| command                | options it accepts                    |
| ---------------------- | ------------------------------------- |
| `init`                 | `--archetype` (a deprecated no-op)    |
| `add`                  | none                                  |
| `remove` / `rm`        | none                                  |
| `update`               | `--force`, `--yes` / `-y`             |
| `list`                 | `--json`                              |
| `status`               | `--strict`, `--no-drift`              |
| *any*                  | `--help` / `-h`, `--version` / `-v`   |

The message goes to stderr with the usage text and exits **1**, exactly like `Unknown option` — the
label differs only because the option is one `pharn` *knows*, so "unknown" would send you hunting for
a typo that is not there.

Before this, such an option was parsed and silently dropped. That was worst in CI: `pharn status
--json | jq` received the human-readable box-drawing output and a **success** exit code, and
`pharn list --strict` exited 0 no matter what it found. With no command word at all, `pharn --json`,
`pharn --force` and `pharn --strict` each ran a **full `init`** while ignoring the option.

Note that only the option *name* is checked. `pharn list --json=false` is still accepted (`--json` is
a `list` option) and still prints human-readable output — pass the bare `--json` for JSON.

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
