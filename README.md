<div align="center">

# pharn

**Install PHARN into your project in one command.**

The installer for [PHARN](https://github.com/pharn-dev/pharn-oss) — an open, audit-grade system of record for AI-written code: the intent, the constraints, and the checks behind a change, kept as plain markdown in your own repo. Runs on Claude Code today.

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

| Artifact                                                              | What lands in your project                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pharn/pharn-pipeline/grillers/<name>/`, `pharn/pharn-review/<name>/` | The installed grillers + lenses, each with its `evals/`                                                              |
| `.claude/commands/`, `.claude/hooks/`                                 | The `pharn-*` product slash commands + the deterministic `.cjs` floor hooks                                          |
| `pharn/pharn-contracts/`, `pharn/floor/`                              | Inter-layer schemas + the floor checkers the commands invoke (minus the floor's own test files and `test-fixtures/`) |
| `pharn/pharn-core/`                                                   | The agnostic mechanism skills the commands cite (the seam resolver + its evals)                                      |
| `pharn/CONSTITUTION.md`, `pharn/ARCHITECTURE.md`                      | Two of the four trusted spec docs, copied verbatim — see the layout note below                                       |
| `THREAT-MODEL.md`, `LIMITS.md`                                        | The other two, at the project **root** — where upstream keeps them and where the installed commands cite them        |
| `pharn/LICENSE` (flat: `PHARN-LICENSE`)                               | PHARN's Apache-2.0 license, copied so a repo you publish carries the grant. Your own root `LICENSE` is never touched |
| `features/README.md`                                                  | The product-loop boundary contract the installed commands cite by name (project root in both layouts)                |
| `pharn.config.json`                                                   | `skillsVersion`, commit SHA, detected archetypes, installed capabilities, and the layout                             |
| `pharn.records.json`                                                  | Per-file sha256 — skips unproven present edits, restores missing; `--force` overwrites                               |

`.claude/*` is **layout-invariant**, and an existing `.claude/settings.json` is **never** overwritten. Everything else follows the fetched version: the CLI **mirrors** whichever layout `pharn-dev/pharn-oss` ships and never rewrites a copied file's contents, so the paths above are the `pharn` layout it installs today. The **four trusted docs** are the same set in both layouts, but their prefix is per-**doc**, not per-layout: upstream's relocation moved `CONSTITUTION.md` and `ARCHITECTURE.md` under `pharn/` and left `THREAT-MODEL.md` and `LIMITS.md` at the repo root, so a `pharn` install lands them exactly that way. Each doc is copied only if the fetched version ships it, and `init` says which docs it wrote and warns about any it did not. The legacy **flat** layout puts the same surfaces at the project root instead (`pharn-pipeline/grillers/`, `pharn-review/`, `pharn-contracts/`, `.dev/floor/`, `PHARN-LICENSE`, and the trusted docs), and ships no `pharn-core/`; which layout you got is recorded as `layout` in `pharn.config.json`. To adjust the selection afterward, use [`pharn add`](docs/commands/add.md) / [`pharn remove`](docs/commands/remove.md).

---

## The pipeline

Once installed, PHARN gives Claude Code a spine of typed stages — each links back to the spec:

```text
spec → plan → grill → build → regress → verify → review → ship
```

After `pharn init`, open Claude Code and run **`/pharn-spec`** to capture your first feature's intent — it feeds **`/pharn-plan`**. (For a small, well-scoped change you can start at **`/pharn-plan`**.)

---

## Commands

| Command                     | Description                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| `pharn init`                | Detect archetypes and install the applicable capabilities (default)             |
| `pharn add [capability]`    | Add a capability, e.g. `a11y` or `lens:n-plus-one` (no arg: pick interactively) |
| `pharn remove <capability>` | Remove an installed capability (no arg: pick one interactively)                 |
| `pharn update`              | Re-fetch installed capabilities at the latest skills version (`--force`)        |
| `pharn list`                | List installed archetypes + capabilities (`--json`)                             |
| `pharn status`              | Show version + local-drift status (read-only; `--strict`, `--no-drift`)         |
| `pharn -h`, `--help`        | Show help                                                                       |
| `pharn -v`, `--version`     | Show version                                                                    |

---

## Prerequisites

- **Git** initialized in the project — the only requirement, checked up front before detection.

There is no stack-pack selection and no package prerequisite to satisfy. See [Getting started](docs/getting-started.md) for the full flow, including the pre-install write-target conflict check.

---

## Documentation

Full reference: **[docs/](docs/README.md)**

- [Getting started](docs/getting-started.md)
- [Commands](docs/commands/init.md) — `init`, `add`, `remove`, `update`, `list`, `status`
- [pharn.config.json](docs/reference/pharn-config.md), [pharn.records.json](docs/reference/pharn-records.md)
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
npm run check        # every CI gate except build, without the coverage threshold
npm run build:install-local   # link pharn into every local test-*/ app
```

`PHARN_DEBUG=1` for verbose errors. Details: [Contributing](CONTRIBUTING.md).

---

## Security

All remote input (repo/branch/commit, capability names and paths, and capability frontmatter) is validated against strict allowlists and checked for path escapes, and contents copied from the clone are never executed or parsed by the CLI.

Every `fetch` uses `redirect: 'error'`, but the size and time caps are sized per request rather than shared. The `SKILLS_VERSION` read gets an 8s timeout and a 256KB body cap. The commit-SHA resolve gets an 8s timeout and no separate body cap. The repo tarball has to cover a streamed multi-megabyte body rather than a one-line response, so it gets a 60s timeout and a 32MB cap counted as the download streams — and because neither of those bounds a compression bomb, a 128MB cap on the decompressed size and a 20,000-entry cap in the extractor. [`THREAT-MODEL.md`](THREAT-MODEL.md) §3 is the canonical table.

Found a vulnerability? Please follow [`SECURITY.md`](SECURITY.md) rather than opening a public issue.

---

## License

[Apache 2.0](LICENSE).
