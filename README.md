<div align="center">

<p align="center">
  <img src="./assets/pharn-logo.svg" alt="Pharn CLI" width="96">
</p>

<h1 align="center">Pharn CLI</h1>

**Install and update PHARN in any git project.**

PHARN gets features shipped right with Claude Code. The spec, plan, and checks
stay in plain files in Git, so months later you can answer "what was done and
why?".

[![npm](https://img.shields.io/npm/v/@pharn-dev/pharn)](https://www.npmjs.com/package/@pharn-dev/pharn)
[![CI](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24.2.0-brightgreen)](./package.json)

```bash
npx @pharn-dev/pharn@latest init
```

</div>

---

## Contents

[What is PHARN?](#what-is-pharn) · [Why use it?](#why-use-it) · [Quick start](#quick-start) · [How it works](#how-it-works) · [What gets installed](#what-gets-installed) · [After install](#after-install) · [Day-to-day workflow](#day-to-day-workflow) · [CLI commands](#cli-commands) · [Agent skills](#agent-skills) · [Safety model](#safety-model) · [Current scope](#current-scope) · [Documentation](#documentation) · [Development](#development) · [Security](#security) · [License](#license)

---

## What is PHARN?

PHARN is a repo-local methodology for making AI-assisted development easier to review, repeat, and
maintain. It gives Claude Code a structured path from feature intent to implementation review:

```text
spec -> plan -> grill -> test -> build -> regress -> verify -> ship
```

The npm package, `@pharn-dev/pharn`, is the installer. It does not scaffold your app. It detects what kind
of project you already have, installs the matching PHARN capabilities from
[`pharn-dev/pharn-oss`](https://github.com/pharn-dev/pharn-oss), and records the install in
`pharn.config.json` and `pharn.records.json`.

## Why use it?

AI agents can move fast, but a fast diff without durable context is hard to trust. PHARN is built around a
simple idea: the reasoning behind a change should be committed beside the change.

- **Preserve intent.** Specs, plans, constraints, and review notes live in the repository, not only in an
  agent transcript.
- **Make work inspectable.** PHARN installs grillers and lenses: pipeline checks and review perspectives
  that help interrogate a plan or diff before it ships.
- **Keep updates safe.** `pharn update` uses per-file hashes to avoid overwriting local edits unless you
  explicitly choose `--force`.
- **Stay tool-shaped, not service-shaped.** The CLI fetches open content, copies files into your project,
  and leaves the state in version-controlled markdown and JSON.

## Quick start

Run PHARN inside an existing git project. For a new app, make sure it is a git repository first
(`create-next-app` already runs `git init` and commits, unless git is missing or you pass `--disable-git`):

```bash
npx create-next-app@latest my-app && cd my-app
[ -d .git ] || { git init && git add -A && git commit -m "init"; }
npx @pharn-dev/pharn@latest init
```

Then open Claude Code and start with `/pharn-spec`, or run the whole chain with
`/pharn-loop implement password reset with a one-time token`. Either way the run begins at the spec:
`/pharn-plan` halts unless an **Approved**, un-drifted `SPEC.md` exists ([walkthrough](docs/getting-started.md)).

**Your project needs a test runner with per-test results.** The `test` stage writes each acceptance
criterion's test before any code exists and requires it to fail, so it needs a `test` script (plus
`test:e2e` or `e2e` for end-to-end criteria) whose reporter writes per-test JSON, named under
`testResults` in `pharn.config.json`. Without one, `/pharn-test` stops and asks, and `/pharn-loop` ends
with `blocked: no-test-runner`. A fresh `create-next-app` has no `test` script, so set the runner up
first, as its own increment (a SPEC with `spec_kind: test-infra`); see upstream's
[Per-test results](https://github.com/pharn-dev/pharn-oss#per-test-results).

## How it works

`pharn init` is archetype-driven. There is no stack questionnaire and no module catalog.

| Step    | What happens                                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detect  | Reads `package.json` dependency names and a bounded, symlink-safe file-tree scan to classify the project as `ssr`, `backend`, `spa`, `lib`, or a combination ([rules](docs/commands/init.md#3-detect-archetypes)).                                                                        |
| Fetch   | Downloads the newest **verified release** of `pharn-dev/pharn-oss` (a tag created only after its post-merge CI passed). With none resolvable it exits 1 and names `--ref main`, never falling back to the tip ([details](docs/troubleshooting.md#no-verified-release-could-be-resolved)). |
| Resolve | Selects capabilities whose `applies` value is `universal` or intersects your archetypes. Skipped capabilities are named with the reason.                                                                                                                                                  |
| Install | Copies the selected capabilities plus the fixed PHARN product surfaces into `.claude/` and `pharn/`.                                                                                                                                                                                      |
| Record  | Writes `pharn.config.json` and `pharn.records.json` so future updates can tell PHARN-owned files from local edits.                                                                                                                                                                        |

## What gets installed

Everything PHARN keeps in your project lives under `.claude/` (commands, hooks, agents) and `pharn/`
(capabilities, contracts, core, floor checkers, the trusted docs, a `LICENSE` copy and the features README),
plus `pharn.config.json` and `pharn.records.json` at the root: commit both. The full table is in
[Getting started: What you get](docs/getting-started.md#what-you-get). An existing `.claude/settings.json`
is never overwritten. As you run the workflow, PHARN writes one directory per increment,
`pharn/features/<name>/`, which is the durable record; commit it. `pharn init` and `pharn update` add
`pharn/.run/` and `pharn/.backup/` to your `.gitignore` ([how](docs/commands/init.md#gitignore)).

**Two version numbers, on purpose.** The npm package `@pharn-dev/pharn` carries the installer's version.
The content it installs carries its own, recorded as `skillsVersion` in `pharn.config.json` and taken from
upstream's `SKILLS_VERSION`. They move independently, and `pharn status` / `pharn update` are keyed to the
latter.

## After install

- **Hooks enforce only once they are registered in `.claude/settings.json`.** If your project already had
  that file, PHARN kept it and printed a `HOOKS` note listing each hook it does not wire, as paste-ready
  JSON. Until you copy them across, the guarantees that depend on a `PreToolUse` hook are inactive, and
  `pharn status --strict` fails.
- **`/pharn-loop` has a `Stop` guard** (`require-loop-record.cjs`) that also does nothing until it is
  registered under `Stop`. `pharn init`, `pharn status` and `pharn update` name a missing entry.
- **`pharn update` never edits `.claude/settings.json`**, so copy new hook entries across by hand. Writes
  issued through Bash bypass the write guards entirely.

What the write guards allow and deny, and the full set of bounds, are in upstream's
[README](https://github.com/pharn-dev/pharn-oss#what-gets-installed) and
[`LIMITS.md`](https://github.com/pharn-dev/pharn-oss/blob/main/LIMITS.md).

## Day-to-day workflow

Once PHARN is installed, use the slash commands from Claude Code. The pipeline is eight typed stages, each
reading what the previous one produced ([what each does](docs/getting-started.md#after-init)).
`/pharn-ship` runs the first seven in one pass and keeps both human gates: approve the spec before code is
written, decide merge/fix/abandon after verification. `/pharn-loop` runs the same chain unattended and
commits a green result to a new local branch (never pushed or merged), leaving the merge decision to you. Outside the pipeline,
`/pharn-review` runs the review lenses over any code, and `/pharn-memory-promote` promotes one lesson into
`pharn/memory-bank/`. `/pharn-spec` uses your own SPEC template if you put one at `pharn/spec-template.md`
(see upstream's [Your own SPEC template](https://github.com/pharn-dev/pharn-oss#your-own-spec-template)).

## CLI commands

| Command                       | Description                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pharn init`                  | Detect archetypes and install matching capabilities. This is also the default when no command is given. `--dry-run` prints what it would install and writes nothing (add `--json` for one machine-readable object); `--yes`/`-y` installs without prompts, but only when no file would be overwritten.                                          |
| `pharn add [capability]`      | Add one capability manually, for example `a11y` or `lens:n-plus-one`. With no argument, opens an interactive picker.                                                                                                                                                                                                                            |
| `pharn remove [capability]`   | Remove one installed capability. With no argument, opens an interactive picker.                                                                                                                                                                                                                                                                 |
| `pharn update`                | Re-fetch and apply the latest PHARN content using drift-safe per-file decisions. `--force` overwrites files you changed; `--yes`/`-y` skips the confirmation prompt; `--dry-run` prints what it would do and writes nothing (add `--json` for the plan as one machine-readable object, and `--compact` to leave the unchanged files out of it). |
| `pharn list`                  | Show installed archetypes and capabilities. Use `--json` for machine-readable output.                                                                                                                                                                                                                                                           |
| `pharn status`                | Read-only version and drift report. Use `--strict` to make drift fail CI, `--no-drift` to skip byte comparison, or `--json` for one machine-readable report.                                                                                                                                                                                    |
| `pharn uninstall`             | Remove PHARN: deletes only the files `pharn` recorded and you did not change, then `pharn.records.json` and `pharn.config.json` (backed up first). Never touches `pharn/.backup/` or a `.claude/settings.json` it did not create. `--yes`/`-y` skips the confirmation prompt.                                                                   |
| `pharn verify-archive <file>` | Check a local pharn-oss `.tar.gz` the way an install checks a download, with no network (for pharn-oss CI; [details](docs/commands/verify-archive.md)). `--expect-version X.Y.Z` also checks `SKILLS_VERSION`.                                                                                                                                  |
| `pharn --help`                | Show every command, option and environment variable. `pharn <command> --help` shows one command and only the options it takes.                                                                                                                                                                                                                  |
| `pharn --version`             | Show the installed CLI version.                                                                                                                                                                                                                                                                                                                 |

`init` also takes `--archetype <list>` (for example `--archetype ssr,backend`) to install for those
archetypes instead of the detected ones; the choice is recorded, so `update` keeps it. `init --ref main`
installs from the tip of pharn-oss's `main` instead of the newest verified release (`--ref latest`, the
default); the channel is recorded, and `update --ref latest` or `update --ref main` switches it. `remove` has the alias `rm`.

If you script the CLI: an option a command does not take, or an extra positional, exits **1**
(``Unsupported option for `status`: "--force"``); off a TTY a plain `init`, `update` or `uninstall` exits 1
(`update --yes` is the CI line; `init --yes` never confirms an overwrite; `--dry-run` needs no terminal);
and one writer at a time holds `pharn/.lock`, while `list` and `status` never take it, so
`pharn status --strict` stays runnable in CI. A config changed while a prompt was open refuses the write.

## Agent skills

The [`pharn-dev/skills`](https://github.com/pharn-dev/skills) repository ships a `pharn-cli` skill that
operates this CLI for you: ask "Is PHARN up to date in this project?" or "What would an update change?" and
it runs the read-only checks and a `--dry-run` first, applies updates without overwriting your edits, and
adds or removes grillers and lenses. It also carries `phargus` skills for
[Phargus](https://github.com/pharn-dev/phargus). In Claude Code, run `/plugin marketplace add pharn-dev/skills`
then `/plugin install pharn@pharn-dev`, or use `npx skills add pharn-dev/skills --skill pharn-cli`. The skills
are optional.

## Safety model

PHARN is intentionally conservative about writes:

- `init` checks for existing install targets and asks before overwriting them, and refuses the whole
  install (writing nothing) when a destination path crosses a symlinked directory.
- `update` uses `pharn.records.json` to skip files it cannot prove are untouched. In your project it deletes
  only the directory of a capability it drops from `pharn.config.json` (PHARN runs whatever capability
  directories are on disk), after backing up any file in it that `pharn` cannot prove it wrote; it never
  touches `.claude/settings.json`. A re-run `init` does the same, after listing those directories in its
  prompt. Every delete, and what is never deleted: [What PHARN deletes](docs/reference/deletes.md).
- `update --force` backs up overwritten files under `pharn/.backup/<timestamp>/` before writing. `add` does
  the same for any destination file that differs from upstream, and refuses the whole install (writing
  nothing) when a destination path crosses a symlinked directory.
- `status` and `list` are read-only.
- `remove` deletes only the selected capability directory and prunes its records, after backing up to
  `pharn/.backup/<timestamp>/` any file in it that `pharn` cannot prove it wrote unchanged; it never touches
  `CONSTITUTION.md`, `pharn/memory-bank/`, or your detected archetypes, and refuses when that directory's
  path crosses a symlink.
- `uninstall` deletes only files recorded in `pharn.records.json` that still match their recorded hash,
  inside `pharn`'s install paths; it keeps every file you changed or added and lists the ones it kept, backs
  up `pharn.config.json` before deleting it, never writes `.claude/settings.json` (it prints the hooks you
  need to unwire instead), and refuses (deleting nothing) without a usable record store.

PHARN can also refuse to install at all: if upstream declares a minimum CLI version newer than yours,
`init`/`add`/`update` stop with a named error before writing anything. Remote content is treated as
untrusted input. Capability names, copyable file names, versions, commit SHAs, and paths are validated
against strict allowlists; path traversal and symlink escapes are rejected; copied file contents are not
executed by the CLI.

## Current scope

- It targets **Claude Code today**. Codex and Cursor support are planned, not shipped.
- It requires a git-initialized project and **Node >= 24.2.0**, for the CLI and for the installed floor
  checkers (`pharn/floor/*.mjs`), which refuse to run on an older Node. `pharn init` and `pharn update`
  refuse up front on an older Node, with nothing written.
- **Archetype detection is JS/TS-shaped and bounded.** A Python, Go, Rust, Ruby or PHP repo without a root
  `package.json` resolves to `lib` and gets the universal capabilities, a correct outcome; `pharn init
--archetype` corrects any misdetection. The rules: [Detect archetypes](docs/commands/init.md#3-detect-archetypes).
- It does not scaffold your app, install framework packages, or replace tests, review or release judgment.
- **Supported installs: the current minor and the previous one.** Re-run `pharn init` on an older install;
  it keeps the capabilities you added. `--json` reports stay additive within `schemaVersion: 1`. See the
  [support policy](docs/support-policy.md) and the [roadmap](docs/roadmap.md).

## Documentation

Start here: [docs/](docs/README.md). [Getting started](docs/getting-started.md) ·
[Commands](docs/README.md#commands) · [pharn.config.json](docs/reference/pharn-config.md) ·
[pharn.records.json](docs/reference/pharn-records.md) · [Support policy](docs/support-policy.md) ·
[Troubleshooting](docs/troubleshooting.md) · [Roadmap](docs/roadmap.md)

## Development

```bash
npm install
npm run dev -- init
npm run build
npm run check   # format:check, lint, lint:md, typecheck, test
```

Other scripts: `npm run test:coverage` (the coverage gate CI runs) and `npm run build:install-local` (build
and install the local CLI into local test apps). Set `PHARN_DEBUG=1` for verbose fetch and install errors;
`NO_COLOR` / `FORCE_COLOR` control colour (see [Colour](docs/troubleshooting.md#colour)). See
[CONTRIBUTING.md](CONTRIBUTING.md) for contributor notes and release discipline.

## Security

The CLI has a small trust boundary: it downloads PHARN content from GitHub, validates and extracts it, then
copies selected files into your project. The security-sensitive path validation, tar extraction, symlink
handling, and update decision tables are covered by tests. Please report vulnerabilities through
[SECURITY.md](SECURITY.md), not public issues. The detailed model is in [THREAT-MODEL.md](THREAT-MODEL.md)
and [LIMITS.md](LIMITS.md).

## License

[Apache 2.0](LICENSE).
