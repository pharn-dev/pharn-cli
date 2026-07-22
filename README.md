<div align="center">

# pharn-cli

**Install PHARN into your project in one command.**

The interactive installer for [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code that keeps comprehension debt legible instead of silent.

[![npm](https://img.shields.io/npm/v/pharn)](https://www.npmjs.com/package/pharn)
[![CI](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml/badge.svg)](https://github.com/pharn-dev/pharn-cli/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)

```bash
npx pharn init
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
npx pharn@latest init
```

`pharn` runs straight from npm — `npx` fetches the latest published version and runs it in your project; no global install. Requires a git-initialized project and Node >= 20.

---

## Why

Vibe-coding with an AI agent is fast — until the chat history scrolls away and takes the _understanding_ with it. That gap is **comprehension debt** ([coined by Addy Osmani](https://addyosmani.com/blog/comprehension-debt/)), and it compounds faster than any other kind. PHARN keeps a markdown-canonical record — spec, constitution, diff, audit trail — in your repo, readable and diffable.

`pharn-cli` is how you get it. Run `pharn init` in your project to pick which PHARN modules and stack pack you want; the CLI fetches them from `pharn-dev/pharn-oss`, copies them into `.claude/`, materializes your constitution + memory bank, and writes `pharn.config.json`.

> The npm package is `pharn`; it installs a single `pharn` binary.

---

## What it installs

PHARN ships as **modules** (subfolders of the pharn-oss repo). `pharn-core` is required; everything else is optional and depends on it.

| Module | What you get |
| ------ | ------------ |
| `pharn-core` | Constitution, markdown memory bank, privacy-shield + constitution-guard hooks, base skills |
| `pharn-pipeline` | The spec → plan → grill → build → regress → verify → ship pipeline |
| `pharn-review` | `/pharn-review` with 13 context lenses + fingerprint ledger |
| `pharn-audits` | 8 standalone audits (privacy, security, a11y, supply-chain, …) |
| `pharn-stack-nextjs` | Next.js + Supabase + Better Auth + Drizzle stack pack (pulls in the React base) |

The wizard also asks a **privacy-posture** question and writes the matching constitution variant (`gdpr-strict`, `standard`, or `minimal`) to `.claude/CONSTITUTION.md`. On newer manifests it additionally installs only the per-technology skills you answer for (e.g. your ORM, database, auth) — never the sibling options you didn't pick.

---

## The pipeline

Once installed, PHARN gives Claude Code a spine of typed stages — each links back to the spec:

```text
spec → plan → grill → build → regress → verify → ship
```

After `pharn init`, open Claude Code and run **`/pharn-plan`** to plan your first feature (or **`/pharn-spec`** first for a fuzzy or larger feature).

---

## Commands

| Command | Description |
| ------- | ----------- |
| `pharn init` | Interactive setup wizard (default) |
| `pharn add <module>` | Add a module to an existing PHARN project |
| `pharn add <category>:<skill>` | Add one technology skill (e.g. `orm:prisma`) |
| `pharn remove <module\|category:skill>` | Remove a module or skill from this project |
| `pharn update` | Update installed modules to the latest skills version |
| `pharn list` | List installed and available modules/skills (`--json`) |
| `pharn status` | Show version + local-drift status (read-only; `--strict`, `--no-drift`) |
| `pharn -h`, `--help` | Show help |
| `pharn -v`, `--version` | Show version |

---

## Prerequisites

- **Git** initialized in the project (required for every install)
- **Stack-pack packages** — only when you pick a pack that declares them (e.g. `pharn-stack-nextjs` requires `next` in `package.json`)

See [Getting started](docs/getting-started.md) for the full flow and fresh-project warnings.

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

All remote input (manifest, repo/branch/commit, module and skill paths) is validated against strict allowlists, checked for path escapes, and fetched with `redirect: 'error'`, an 8s timeout, and a 256KB body cap. Found a vulnerability? Please follow [`SECURITY.md`](SECURITY.md) rather than opening a public issue.

---

## License

[Apache 2.0](LICENSE).
