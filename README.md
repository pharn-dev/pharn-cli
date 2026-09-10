<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/pharn-logo-dark-transparent.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/pharn-logo-light-transparent.svg">
  <img alt="Pharn" src="assets/pharn-logo-light-transparent.svg" width="420">
</picture>

**Install PHARN into an existing project: a reviewable workflow for AI-written code.**

PHARN is an open, audit-grade methodology for Claude Code. It keeps the intent,
constraints, plans, checks, and review trail for AI-assisted changes in plain
files inside your repo, so the reasoning behind a change survives beyond the
chat window.

[![npm](https://img.shields.io/npm/v/@pharn-dev/pharn)](https://www.npmjs.com/package/@pharn-dev/pharn)
[![CI](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

```bash
npx @pharn-dev/pharn@latest init
```

</div>

---

## Contents

- [What is PHARN?](#what-is-pharn)
- [Why use it?](#why-use-it)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [What gets installed](#what-gets-installed)
- [After install](#after-install)
- [Day-to-day workflow](#day-to-day-workflow)
- [CLI commands](#cli-commands)
- [Safety model](#safety-model)
- [Current scope](#current-scope)
- [Documentation](#documentation)
- [Development](#development)
- [Security](#security)
- [License](#license)

---

## What is PHARN?

PHARN is a repo-local methodology for making AI-assisted development easier to
review, repeat, and maintain. It gives Claude Code a structured path from
feature intent to implementation review:

```text
spec -> plan -> grill -> build -> regress -> verify -> ship
```

The npm package, `@pharn-dev/pharn`, is the installer. It does not scaffold your
app. It detects what kind of project you already have, installs the matching
PHARN capabilities from [`pharn-dev/pharn-oss`](https://github.com/pharn-dev/pharn-oss),
and records the install in `pharn.config.json` and `pharn.records.json`.

## Why use it?

AI agents can move fast, but a fast diff without durable context is hard to
trust. PHARN is built around a simple idea: the reasoning behind a change should
be committed beside the change.

- **Preserve intent.** Specs, plans, constraints, and review notes live in the
  repository, not only in an agent transcript.
- **Make work inspectable.** PHARN installs grillers and lenses: pipeline
  auditors and review perspectives that help interrogate a plan or diff before
  it ships.
- **Keep updates safe.** `pharn update` uses per-file hashes to avoid
  overwriting local edits unless you explicitly choose `--force`.
- **Stay tool-shaped, not service-shaped.** The CLI fetches open content,
  copies files into your project, and leaves the state in version-controlled
  markdown and JSON.

## Quick start

Run PHARN inside an existing git project:

```bash
npx @pharn-dev/pharn@latest init
```

For a new app, initialize git before installing PHARN:

```bash
npx create-next-app@latest my-app
cd my-app
git init
git add -A
git commit -m "init"
npx @pharn-dev/pharn@latest init
```

After install, open Claude Code in the project and start with:

```text
/pharn-spec
```

Or run the whole chain in one command:

```text
/pharn-loop implement password reset with a one-time token
```

Either way the run begins at the spec, and it has to: `/pharn-plan` enforces a
deterministic input gate and halts unless an **Approved**, un-drifted `SPEC.md`
already exists, so there is no entry point further down the chain. The exact
command files come from the `pharn-dev/pharn-oss` version installed into your
repo.

## How it works

`pharn init` is archetype-driven. There is no stack questionnaire and no module
catalog.

| Step | What happens |
| ---- | ------------ |
| Detect | Reads `package.json` dependency names and performs a bounded, symlink-safe file-tree scan to classify the project as `ssr`, `backend`, `spa`, `lib`, or a combination. |
| Fetch | Resolves `pharn-dev/pharn-oss@main` to a commit SHA, downloads the GitHub codeload tarball, and extracts it into a temp directory. |
| Resolve | Selects capabilities whose `applies` value is `universal` or intersects your detected archetypes. Skipped capabilities are named with the reason. |
| Install | Copies the selected capabilities plus fixed PHARN product surfaces into your repo, mirroring the upstream layout. |
| Record | Writes `pharn.config.json` and `pharn.records.json` so future updates can tell PHARN-owned files from local edits. |

The current upstream install layout places most runtime surfaces under `pharn/`
and Claude Code integration under `.claude/`. Older flat-layout installs are
still understood through the recorded `layout` field.

## What gets installed

| Artifact | Purpose |
| -------- | ------- |
| `pharn/pharn-pipeline/grillers/<name>/`, `pharn/pharn-review/<name>/` | Pipeline auditors and review lenses selected for your project archetype(s). |
| `.claude/commands/`, `.claude/hooks/` | The installed `/pharn-*` Claude Code slash commands and deterministic `.cjs` hooks. |
| `pharn/pharn-contracts/`, `pharn/floor/` | Schemas shared across PHARN stages and floor checkers invoked by the workflow. |
| `pharn/pharn-core/` | Agent-readable mechanism skills, including the seam resolver. |
| `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md` | Trusted PHARN docs copied from upstream in the current layout. |
| `THREAT-MODEL.md`, `LIMITS.md` | Trusted PHARN docs copied at the project root in the current layout. |
| `pharn/LICENSE` (flat: `PHARN-LICENSE`) | PHARN's Apache-2.0 license copy. Your root `LICENSE` is never overwritten. |
| `pharn/features/README.md` | The feature-loop boundary contract referenced by installed commands (pharn layout). |
| `pharn.config.json` | Installed version, commit, layout, archetypes, capabilities, and defaults. |
| `pharn.records.json` | Per-file hashes for drift-safe updates. Commit this with the config. |

An existing `.claude/settings.json` is preserved. PHARN may create it when
absent, but it never overwrites your Claude Code settings.

As you run the workflow, PHARN writes one directory per increment —
`features/<name>/` — holding that increment's `SPEC.md`, `PLAN.md`, `GRILL.md`,
`BUILD.md`, `REGRESSION.md`, `VERIFY.md` and `SHIP.md`. Those are the durable
record; commit them. `.pharn/` (runtime scratch), `.pharn-backup/` (see
[Safety model](#safety-model)) and `.pharn.lock` are not — add them to your
`.gitignore`. PHARN never edits `.gitignore` for you.

**Two version numbers, on purpose.** The npm package `@pharn-dev/pharn` carries
the installer's version. The content it installs carries its own,
recorded as `skillsVersion` in `pharn.config.json` and taken from upstream's
`SKILLS_VERSION`. They move independently, and `pharn status` / `pharn update`
are keyed to the latter.

## After install

Two things about the installed hooks are worth knowing on day one.

**Hooks enforce only once they are registered in `.claude/settings.json`.** If
your project already had that file, PHARN preserved it and printed a warning
instead of overwriting it — so until you copy the hook wiring across, every
guarantee that depends on a `PreToolUse` hook is inactive.

**Once wired, the write guard is fail-closed.** With no active scope, Claude
Code's Write/Edit/MultiEdit/NotebookEdit tools are restricted to `features/**`
and `.pharn/**`; ordinary edits to your own source are denied. That is the
intended posture — a stage sets the scope from the concrete paths your
`PLAN.md` declared — but it means the guard is not a drop-in for editing
outside a PHARN run. Clearing the scope returns to this default; it does not
re-open your source.

Writes issued through Bash bypass both hooks entirely.

The full set of bounds lives in upstream's
[`LIMITS.md`](https://github.com/pharn-dev/pharn-oss/blob/main/LIMITS.md) and
[README](https://github.com/pharn-dev/pharn-oss#readme).

## Day-to-day workflow

Once PHARN is installed, use the slash commands from Claude Code. The pipeline
is seven typed stages, each reading what the previous one produced:

| Stage | Command | Purpose |
| ----- | ------- | ------- |
| Spec | `/pharn-spec` | Capture feature intent and scope. Stops for your approval. |
| Plan | `/pharn-plan` | Turn the approved spec into an implementation plan. |
| Grill | `/pharn-grill` | Challenge the plan before code is written. |
| Build | `/pharn-build` | Implement an approved increment. |
| Regress | `/pharn-regress` | Look for regressions outside the just-built feature. |
| Verify | `/pharn-verify` | Verify behavior and PHARN floor requirements. |
| Ship | `/pharn-ship` | Run stages 1-6 in order, then stop at the merge/fix/abandon gate. |

`/pharn-ship` is itself the seventh stage: it orchestrates the six before it in
one pass, so you rarely run them by hand. `/pharn-loop` runs that same chain but
iterates build -> regress -> verify until green, an iteration cap, or a terminal
failure. Both preserve the two human gates — approve the spec before code is
written, decide merge/fix/abandon after verification.

Two commands sit outside the pipeline:

| Command | Purpose |
| ------- | ------- |
| `/pharn-review` | Run the review lenses in parallel over any code and merge their findings deterministically. Standalone — no pipeline stage invokes it. |
| `/pharn-memory-promote` | Promote one lesson into `memory-bank/` through a gated provenance check. |

## CLI commands

| Command | Description |
| ------- | ----------- |
| `pharn init` | Detect archetypes and install matching capabilities. This is also the default when no command is given. |
| `pharn add [capability]` | Add one capability manually, for example `a11y` or `lens:n-plus-one`. With no argument, opens an interactive picker. |
| `pharn remove [capability]` | Remove one installed capability. With no argument, opens an interactive picker. |
| `pharn update` | Re-fetch and apply the latest PHARN content using drift-safe per-file decisions. `--force` overwrites files you changed; `--yes`/`-y` skips the confirmation prompt. |
| `pharn list` | Show installed archetypes and capabilities. Use `--json` for machine-readable output. |
| `pharn status` | Read-only version and drift report. Use `--strict` to make drift fail CI, or `--no-drift` to skip byte comparison. |
| `pharn --help` | Show command help. |
| `pharn --version` | Show the installed CLI version. |

`init` also accepts `--archetype`, a deprecated no-op kept for one release —
archetype detection is now the default.

Three behaviours matter if you script the CLI:

- **Options are per-command.** Passing one a command does not take prints
  ``Unsupported option for `status`: "--json"`` to stderr with the usage text
  and exits **1**; an extra positional is refused the same way. Both previously
  parsed, were silently dropped, and exited 0.
- **`init` and `update` are interactive-only.** Off a TTY they exit 1 rather
  than prompting into a dead stream. `update --yes` is the way through in CI;
  `init` deliberately has no `--yes`, because its second prompt is the
  destructive overwrite confirmation.
- **One writer at a time.** `init`, `add`, `remove` and `update` take an
  advisory lock at `.pharn.lock`; a second run refuses rather than queueing.
  `list` and `status` never take it and are never blocked by one, so
  `pharn status --strict` stays runnable in CI while an update is in flight.

## Safety model

PHARN is intentionally conservative about writes:

- `init` checks for existing install targets and asks before overwriting them.
- `update` uses `pharn.records.json` to skip files it cannot prove are
  untouched.
- `update --force` backs up overwritten files under `.pharn-backup/<timestamp>/`
  before writing. `add` does the same for any destination file that differs from
  upstream, and refuses the whole install — writing nothing — when a destination
  path crosses a symlinked directory.
- `status` and `list` are read-only.
- `remove` deletes only the selected capability directory and prunes its records;
  it never touches `CONSTITUTION.md`, `memory-bank/`, or your detected
  archetypes.

PHARN can also refuse to install at all: if upstream declares a minimum CLI
version newer than yours, `init`/`add`/`update` stop with a named error before
writing anything.

Remote content is treated as untrusted input. Capability names, copyable file
names, versions, commit SHAs, and paths are validated against strict allowlists;
path traversal and symlink escapes are rejected; copied file contents are not
executed by the CLI.

## Current scope

PHARN is intentionally scoped:

- It targets **Claude Code today**. Codex and Cursor support are planned, not
  shipped.
- It requires a git-initialized project and declares Node >= 20 support. CI
  currently runs on Node 24.
- **Archetype detection is JS/TS-shaped.** The signals are `package.json`
  dependency names plus `next.config.*`, `app/` route handlers, `.tsx`/`.jsx`,
  `migrations/` and `.sql`. A Python, Go or Rust repo produces no signal,
  resolves to `lib`, and receives the universal capabilities only — a correct
  outcome, not a failure.
- It does not scaffold your application or install framework packages.
- It does not replace tests, human review, or release judgment. It gives those
  activities a structured record and repeatable workflow.
- `status` reports modified, missing, and unreadable PHARN-owned paths;
  orphaned-file detection is still planned.

See the [roadmap](docs/roadmap.md) for shipped versus planned work.

## Documentation

Start here: [docs/](docs/README.md)

- [Getting started](docs/getting-started.md)
- [Command reference](docs/README.md#commands)
- [pharn.config.json](docs/reference/pharn-config.md)
- [pharn.records.json](docs/reference/pharn-records.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)

## Development

```bash
npm install
npm run dev -- init
npm run build
npm run test
npm run check
```

Useful scripts:

| Script | Purpose |
| ------ | ------- |
| `npm run typecheck` | Type-check source and tests. |
| `npm run lint` | Run ESLint with zero warnings. |
| `npm run lint:md` | Run markdownlint over docs and root markdown. |
| `npm run test:coverage` | Run the Vitest coverage gate used by CI. |
| `npm run build:install-local` | Build and install the local CLI into local test apps. |

Set `PHARN_DEBUG=1` for verbose fetch and install errors. See
[CONTRIBUTING.md](CONTRIBUTING.md) for contributor notes and release discipline.

## Security

The CLI has a small trust boundary: it downloads PHARN content from GitHub,
validates and extracts it, then copies selected files into your project. The
security-sensitive path validation, tar extraction, symlink handling, and update
decision tables are covered by tests.

Please report vulnerabilities through [SECURITY.md](SECURITY.md), not public
issues. The detailed model is in [THREAT-MODEL.md](THREAT-MODEL.md) and
[LIMITS.md](LIMITS.md).

## License

[Apache 2.0](LICENSE).
