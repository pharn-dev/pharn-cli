# Contributing to pharn-cli

Development guide for the pharn-cli package. This is the full guide; the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) is the quick-start pointer.

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
| `npm run build:install-local` | Build and symlink `pharn` into the local `test-app/node_modules` (no-op if `test-app/` is absent) |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run typecheck` | `tsc` for src and tests |
| `npm run lint` | ESLint on `src/` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI-friendly) |

From the `test-app/` directory (which needs its own `package.json`) after `build:install-local`:

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
    steps/                wizard steps (prereqs, fresh-check, mode-select, wizard-questions, module/stackpack/constitution select, summary, install)
    lib/                  manifest, wizard, repo, installer, install-modules, pharn-config, validate, constants, banner, confirm, format
    types.ts              Manifest / ModuleManifest / WizardConfig / PharnConfig
  tests/                  vitest specs
  docs/                   user + maintainer documentation
  scripts/install-local.mjs
```

See [`CLAUDE.md`](../CLAUDE.md) for the architecture in depth (the init step pipeline, dependency resolution, and the security-sensitive libs).

## Security-sensitive files

`lib/validate.ts`, `lib/manifest.ts`, and `lib/install-modules.ts` handle all remote input (manifest, module names, install/skill paths, wizard values). Preserve their invariants when editing:

- Strict regex allowlists (`MODULE_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`, `WIZARD_VALUE_RE`), `..` rejection, and control-char rejection.
- Every copy — modules and skills — is guarded by `safeJoin` so nothing escapes its base directory.
- Remote fetches use `redirect: 'error'`, an 8s timeout, and a 256KB body cap.
- The manifest `schemaVersion` must be exactly `1` or `2` — anything else hard-fails by design so old CLIs don't guess at a new schema.

## Test map

| Test file | Behavior covered |
| --------- | ---------------- |
| `manifest.test.ts` / `manifest-v2.test.ts` | v1 parse/validate of manifest + module.json, dependency resolution, exclusivity, categorization; `parseManifest` schemaVersion routing + `wizard` block validation |
| `wizard.test.ts` | `matchCondition` and the pure rule engine / answer resolver (`lib/wizard.ts`) |
| `wizard-questions.test.ts` | `runWizardQuestions` Custom-mode rendering (hide / relabel / coming-soon / warn rules) |
| `mode-select.test.ts` | Default vs Custom stack mode select |
| `install-modules.test.ts` / `install-skills.test.ts` | Copy `installs` maps, materialize memory-bank + constitution; selective `installSkills`; path-escape guards |
| `installer.test.ts` / `install.test.ts` | `fetchAndInstall` shared core; `runInstall` step |
| `init.test.ts` / `init-v2.test.ts` | v1 and v2 init pipelines end to end |
| `add.test.ts` / `update.test.ts` | `runAdd` (module + `category:skill`) and `runUpdate` re-resolution |
| `validate.test.ts` | `assertSafeString` allowlists, `..` and control-char rejection |
| `pharn-config.test.ts` | Read/write/round-trip `pharn.config.json`, incl. v2 additive fields |
| `prereqs.test.ts` | Next.js and git checks |
| `fresh-check.test.ts` | Commit counts, custom file heuristic |
| `confirm.test.ts` | Cancel and warn helpers |
| `repo.test.ts` / `banner.test.ts` / `format.test.ts` | degit clone wrapper; banner; format helpers |

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
