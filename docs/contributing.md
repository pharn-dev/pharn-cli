# Contributing to pharn

Development guide for the pharn package. This is the full guide; the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) is the quick-start pointer.

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
npx @pharn-dev/pharn init
```

Published package `@pharn-dev/pharn` exposes a single `pharn` bin (see `package.json`).

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
    commands/             init, add, remove, update, list, status
    steps/                init stages (prereqs, fresh-check, archetype-summary, install-archetype)
    lib/                  install-capabilities, capability-index, resolve-capabilities, detect-archetype, layout, repo, diff, skills-version, pharn-config, validate, constants, banner, confirm, format
    types.ts              Archetype / CapabilityEntry / Selection / PharnConfig
  tests/                  vitest specs
  docs/                   user + maintainer documentation
  scripts/install-local.mjs
```

See [`CLAUDE.md`](../CLAUDE.md) for the architecture in depth (the archetype install flow, capability resolution, and the security-sensitive libs).

## Security-sensitive files

`lib/validate.ts` and `lib/install-capabilities.ts` handle all untrusted remote input (capability names, install paths, frontmatter). Preserve their invariants when editing:

- Strict regex/enum allowlists (`CAPABILITY_NAME_RE`, `VERSION_RE`, `INSTALL_PATH_RE`, `COPY_FILENAME_RE`, the `role`/`applies` enums), `..` rejection, and control-char rejection.
- `safeJoin` (in `lib/validate.ts`) guards every read/copy so nothing escapes its base directory; `install-capabilities.ts` adds a symlink-aware backstop at the write sites and rejects symlinked sources.
- Remote fetches (`lib/skills-version.ts`) use `redirect: 'error'`, an 8s timeout, and a 256KB body cap.

## Test map

| Test file | Behavior covered |
| --------- | ---------------- |
| `detect-archetype.test.ts` / `archetype.test.ts` | Archetype detection from `package.json` names + file-tree signals |
| `capability-index.test.ts` | Parse/validate the untrusted capability index (frontmatter → typed entries) |
| `resolve-capabilities.test.ts` | Select capabilities by `applies` against detected archetypes |
| `install-capabilities.test.ts` | Copy capability dirs + fixed product surfaces; symlink + path-escape guards |
| `init.test.ts` / `init-archetype.test.ts` | The archetype init flow end to end |
| `add.test.ts` / `update.test.ts` | `runAdd` (capability add) and `runUpdate` (archetype re-resolve) |
| `remove.test.ts` | `runRemove` capability deletion (flat + `pharn/` layouts) |
| `list.test.ts` / `status.test.ts` | Read-only inventory + version/drift audit |
| `diff.test.ts` | `diffInstalledCapabilities` expected-set derivation + byte compare |
| `layout.test.ts` | `detectLayout` / `configLayout` / `layoutPaths` |
| `validate.test.ts` | Allowlists, `..`/control-char rejection, and `safeJoin` containment |
| `pharn-config.test.ts` | Round-trip `pharn.config.json`; `loadArchetypeConfigOrExit` legacy reject |
| `skills-version.test.ts` | Read/fetch + validate `SKILLS_VERSION` |
| `prereqs.test.ts` / `fresh-check.test.ts` | git check; commit counts + custom-file heuristic |
| `model-routing.test.ts` / `seam-config.test.ts` | `models` / `seam` config validation |
| `confirm.test.ts` / `repo.test.ts` / `banner.test.ts` / `format.test.ts` | helpers; degit clone wrapper; banner; format |

When changing behavior, add or update tests before docs.

## Documentation maintenance

Keep [`docs/`](./README.md) aligned with code when you change:

| Code change | Update docs |
| ----------- | ----------- |
| Install output or config shape | [reference/pharn-config.md](./reference/pharn-config.md) |
| Archetype detection or capability resolution | [commands/init.md](./commands/init.md), [getting-started.md](./getting-started.md) |
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
