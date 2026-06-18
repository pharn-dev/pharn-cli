# pharn-cli

Installer for [PHARN](https://github.com/pharn-dev/pharn-oss) — an audit-grade methodology for Claude Code. Run `pharn init` in your project to pick which PHARN modules and stack pack you want; the CLI fetches them from `pharn-dev/pharn-oss`, copies them into `.claude/`, materializes your constitution + memory bank, and writes `pharn.config.json`.

```bash
npx pharn init
```

The npm package is `pharn-cli`; it exposes both `pharn` and `pharn-cli` binaries.

## What it installs

PHARN ships as **modules** (subfolders of the pharn-oss repo). `pharn-core` is required; everything else is optional and depends on it.

| Module | What you get |
| ------ | ------------ |
| `pharn-core` | Constitution, markdown memory bank, privacy-shield + constitution-guard hooks, base skills |
| `pharn-pipeline` | The spec → plan → grill → build → regress → verify → ship pipeline |
| `pharn-review` | `/pharn-review` with 13 context lenses + fingerprint ledger |
| `pharn-audits` | 8 standalone audits (privacy, security, a11y, supply-chain, …) |
| `pharn-stack-nextjs` | Next.js + Supabase + Better Auth + Drizzle stack pack (pulls in the React base) |

The wizard also asks a **privacy-posture** question and writes the matching constitution variant (`gdpr-strict`, `standard`, or `minimal`) to `.claude/CONSTITUTION.md`.

## Documentation

Full reference: **[docs/](docs/README.md)**

- [Getting started](docs/getting-started.md)
- [Commands](docs/commands/init.md) — `init`, `add`, `remove`, `update`, `list`, `status`
- [pharn.config.json](docs/reference/pharn-config.md)
- [Troubleshooting](docs/troubleshooting.md)

## Prerequisites

- **Next.js** in `package.json` (required for the stack pack)
- **Git** initialized in the project

See [Getting started](docs/getting-started.md) for the full flow and fresh-project warnings.

## Commands

| Command | Description |
| ------- | ----------- |
| `pharn init` | Interactive setup wizard (default) |
| `pharn add <module>` | Add a module to an existing PHARN project |
| `pharn add <category>:<skill>` | Add one technology skill (e.g. `orm:prisma`) |
| `pharn remove <module\|category:skill>` | Remove a module or skill from this project |
| `pharn update` | Update installed modules to the latest skills version |
| `pharn list` | List installed and available modules/skills |
| `pharn status` | Show version + local-drift status (read-only; `--strict`, `--no-drift`) |
| `pharn -h`, `--help` | Show help |
| `pharn -v`, `--version` | Show version |

After init: open Claude Code and run **`/pharn-plan`** to plan your first feature.

## Development

```bash
cd pharn-cli
npm install
npm run dev          # e.g. npm run dev -- init
npm run build
npm run test
npm run build:install-local   # link pharn into the local test-app/
```

`PHARN_DEBUG=1` for verbose errors. Details: [Contributing](CONTRIBUTING.md).

## License

See the repository root for license information.
