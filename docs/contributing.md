# Contributing to pharn-cli

Development guide for the PHARN CLI package in the quolla monorepo. This is the full guide; the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) is the quick-start pointer.

## Setup

```bash
cd pharn-cli
npm install
```

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Run CLI via tsx, e.g. `npm run dev -- init` |
| `npm run build` | Compile `src/` to `dist/` |
| `npm run build:install-local` | Build and symlink `pharn` into parent `node_modules` |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run typecheck` | `tsc` for src and tests |
| `npm run lint` | ESLint on `src/` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI-friendly) |

From repo root after `build:install-local`:

```bash
npx pharn init
```

Published package `pharn-cli` exposes both `pharn` and `pharn-cli` bins (see `package.json`).

## Quality gates

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs these gates on every push and PR — all must pass:

```bash
npm run format:check
npm run lint
npm run lint:md      # markdownlint-cli2 over docs/ and root *.md
npm run typecheck
npm run test:coverage  # vitest with enforced coverage thresholds
```

`npm run check` runs `format:check` + `lint` + `typecheck` + `test` as a single local pre-push command.

A separate CodeQL workflow analyzes the JavaScript/TypeScript surface on PRs, pushes to `main`, and weekly.

## Branch & commit style

- Branch with a `feat/…`, `fix/…`, or `docs/…` prefix.
- Commit in [Conventional Commits](https://www.conventionalcommits.org/) style, one logical change per commit.
- Open an issue first for any non-trivial change — PHARN is small-surface on purpose.

## Project layout

```text
pharn-cli/
  src/
    index.ts              CLI entry, command routing
    commands/             init, add, update
    steps/                wizard steps (module/stackpack/constitution select, summary, install)
    lib/                  manifest, repo, installer, install-modules, pharn-config, validate, constants, banner, confirm, format
    types.ts              Manifest / ModuleManifest / WizardConfig / PharnConfig
  tests/                  vitest specs
  docs/                   user + maintainer documentation
  scripts/install-local.mjs
```

See [`CLAUDE.md`](../CLAUDE.md) for the architecture in depth (the init step pipeline, dependency resolution, and the security-sensitive libs).

## Security-sensitive files

`lib/validate.ts`, `lib/manifest.ts`, and `lib/install-modules.ts` handle all remote input (manifest, module names, install paths). Preserve their invariants when editing:

- Strict regex allowlists (`MODULE_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`), `..` rejection, and control-char rejection.
- Copies are guarded by `safeJoin` so nothing escapes its base directory.
- Remote fetches use `redirect: 'error'`, an 8s timeout, and a 256KB body cap.
- The manifest `schemaVersion` must be exactly `1` — a mismatch hard-fails by design.

## Test map

| Test file | Behavior covered |
| --------- | ---------------- |
| `manifest.test.ts` | Parse/validate manifest + module.json, dependency resolution, exclusivity, categorization |
| `install-modules.test.ts` | Copy `installs` maps, materialize memory-bank + constitution, path-escape guards |
| `pharn-config.test.ts` | Read/write/round-trip `pharn.config.json` |
| `prereqs.test.ts` | Next.js and git checks |
| `fresh-check.test.ts` | Commit counts, custom file heuristic |
| `confirm.test.ts` | Cancel and warn helpers |

When changing behavior, add or update tests before docs.

## Documentation maintenance

Keep [`docs/`](./README.md) aligned with code when you change:

| Code change | Update docs |
| ----------- | ----------- |
| Install output or config shape | [reference/pharn-config.md](./reference/pharn-config.md) |
| Wizard steps or resolution | [commands/init.md](./commands/init.md), [getting-started.md](./getting-started.md) |
| New validation or warning | [troubleshooting.md](./troubleshooting.md) |
| New command or behavior | `commands/*.md`, [roadmap.md](./roadmap.md) |
| CLI `--help` text | [commands/init.md](./commands/init.md), [README.md](../README.md) |

Do not document behavior that is not implemented without marking **Coming soon** or referencing [roadmap.md](./roadmap.md).

## Debug flag

`PHARN_DEBUG=1` enables full error output for catalog fetch and install failures. Document new debug surfaces in [troubleshooting.md](./troubleshooting.md).

## License

By contributing, you agree your contributions are licensed under the repository's [Apache 2.0 license](../LICENSE).

## Related

- [Docs index](./README.md)
- [init command](./commands/init.md)
- [pharn.config.json](./reference/pharn-config.md)
