<div align="center">

# pharn

**Install PHARN into your project in one command.**

The installer for [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code that keeps comprehension debt legible instead of silent.

[![npm](https://img.shields.io/npm/v/@pharn-dev/pharn)](https://www.npmjs.com/package/@pharn-dev/pharn)
[![CI](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

```bash
npx @pharn-dev/pharn init
```

</div>

---

## Contents

- [Install](#install)
- [Why](#why)
- [What it installs](#what-it-installs)
- [The pipeline](#the-pipeline)
- [Commands](#commands)
- [Prerequisites](#prerequisites)
- [Documentation](#documentation)
- [Development](#development)
- [Security](#security)
- [License](#license)

---

## Install

```bash
npx @pharn-dev/pharn@latest init
```

`pharn` runs straight from npm — `npx` fetches the latest published version and runs it in your project; no global install. Requires a git-initialized project and Node >= 20.

---

## Why

Vibe-coding with an AI agent is fast — until the chat history scrolls away and takes the _understanding_ with it. That gap is **comprehension debt** ([coined by Addy Osmani](https://addyosmani.com/blog/comprehension-debt/)), and it compounds faster than any other kind. PHARN keeps a markdown-canonical record — spec, constitution, diff, audit trail — in your repo, readable and diffable.

`pharn` is how you get it. Run `pharn init` in your project; the CLI detects your project's **archetype(s)**, fetches the applicable PHARN **capabilities** from `pharn-dev/pharn-oss`, copies them plus the canonical constitution into the mirrored layout (`.claude/` + `pharn/`), and writes `pharn.config.json`.

> The npm package is `@pharn-dev/pharn`; it installs a single `pharn` binary.

---

## What it installs

`pharn init` detects your project's **archetype(s)** and installs the PHARN **capabilities** that apply to them — nothing you didn't ask for. There is no module catalog and no `manifest.json`: capabilities are the install unit.

- **Archetype** — a closed set describing what your project _is_: `ssr`, `backend`, `spa`, or `lib` (the frameworkless base). Detection merges your `package.json` dependency **names** with a bounded, symlink-safe file-tree scan (names only, never file bodies). A project can match several (Next + Express → `ssr` + `backend`); a signal-less project resolves to `lib`.
- **Capability** — one **griller** (a pipeline auditor) or **lens** (a review lens). Each declares `applies: 'universal'` or a set of archetypes; it is **selected** when universal or when its `applies` intersects your detected archetypes, and **skipped** otherwise (with the reason shown).

After a summary of what was selected vs. skipped and your confirmation, the CLI copies the selected capabilities plus the fixed product surfaces into the mirrored layout and writes `pharn.config.json`:

| Artifact | What lands in your project |
| -------- | -------------------------- |
| `pharn-pipeline/grillers/<name>/`, `pharn-review/<name>/` | The selected grillers + lenses (flat layout, or the same under `pharn/`) |
| `.claude/commands/` | The `pharn-*` product slash commands |
| `.claude/hooks/` | The deterministic `.cjs` floor hooks |
| `pharn-contracts/`, `.dev/floor/` | Inter-layer schemas + the floor checkers the commands invoke |
| `CONSTITUTION.md` | The canonical PHARN constitution, copied verbatim |
| `pharn.config.json` | `skillsVersion`, commit SHA, detected archetypes, installed capabilities, and layout |

An existing `.claude/settings.json` is **never** overwritten. To adjust the selection afterward, use [`pharn add`](docs/commands/add.md) / [`pharn remove`](docs/commands/remove.md).

---

## The pipeline

Once installed, PHARN gives Claude Code a spine of typed stages — each links back to the spec:

```text
spec → plan → grill → build → regress → verify → review → ship
```

After `pharn init`, open Claude Code and run **`/pharn-plan`** to plan your first feature (or **`/pharn-spec`** first for a fuzzy or larger feature).

---

## Commands

| Command | Description |
| ------- | ----------- |
| `pharn init` | Detect archetypes and install the applicable capabilities (default) |
| `pharn add <capability>` | Add one capability, e.g. `a11y` or `lens:n-plus-one` |
| `pharn remove <capability>` | Remove an installed capability (no arg: pick one interactively) |
| `pharn update` | Re-fetch installed capabilities at the latest skills version |
| `pharn list` | List installed archetypes + capabilities (`--json`) |
| `pharn status` | Show version + local-drift status (read-only; `--strict`, `--no-drift`) |
| `pharn -h`, `--help` | Show help |
| `pharn -v`, `--version` | Show version |

---

## Prerequisites

- **Git** initialized in the project — the only requirement, checked up front before detection.

There is no stack-pack selection and no package prerequisite to satisfy. See [Getting started](docs/getting-started.md) for the full flow and fresh-project warnings.

---

## Documentation

Full reference: **[docs/](docs/README.md)**

- [Getting started](docs/getting-started.md)
- [Commands](docs/commands/init.md) — `init`, `add`, `remove`, `update`, `list`, `status`
- [pharn.config.json](docs/reference/pharn-config.md)
- [Roadmap](docs/roadmap.md)
- [Troubleshooting](docs/troubleshooting.md)

---

## Development

```bash
cd pharn-cli
npm install
npm run dev          # e.g. npm run dev -- init
npm run build
npm run test
npm run check        # format:check + lint + typecheck + test
npm run build:install-local   # link pharn into the local test-app/
```

`PHARN_DEBUG=1` for verbose errors. Details: [Contributing](CONTRIBUTING.md).

---

## Security

All remote input (repo/branch/commit, capability names and paths, and capability frontmatter) is validated against strict allowlists, checked for path escapes, and fetched with `redirect: 'error'`, an 8s timeout, and a 256KB body cap. Contents copied from the clone are never executed or parsed by the CLI. Found a vulnerability? Please follow [`SECURITY.md`](SECURITY.md) rather than opening a public issue.

---

## License

[Apache 2.0](LICENSE).
