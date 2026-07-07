# Contributing to pharn-cli

Thanks for your interest in improving PHARN. This repository **is `pharn-cli`** — the ESM-only Node CLI that fetches PHARN modules from `pharn-dev/pharn-oss` and installs them into a project's `.claude/`. The full contributor guide lives in [`docs/contributing.md`](./docs/contributing.md) — start there.

## Read first

Before changing anything, read these in order:

1. [`CLAUDE.md`](./CLAUDE.md) — how the CLI works and its hard constraints (the architecture source of truth: the init step pipeline, dependency resolution, and the security-sensitive libs).
2. [`README.md`](./README.md) — what the CLI is and how it's run.
3. [`docs/contributing.md`](./docs/contributing.md) — the full development guide (setup, quality gates, test map, doc maintenance).

## Quick links

- **How to contribute** → [`docs/contributing.md`](./docs/contributing.md) (setup, quality gates, branch naming, commit style, test map, doc maintenance)
- **Where your change goes** → [`CLAUDE.md`](./CLAUDE.md) architecture section and the [test map](./docs/contributing.md#test-map)
- **The rules of the repo** → [`CLAUDE.md`](./CLAUDE.md) (source of truth — read it before adding, editing, or removing anything)
- **User-facing docs** → [`docs/`](./docs/README.md)
- **Community standards** → [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

## The 30-second version

1. **Open an issue first** for any non-trivial change. PHARN is small-surface on purpose.
2. **Install**: `cd pharn-cli && npm install` (dev-only tooling; only `dist/` ships to npm).
3. **Run the gates before pushing** — all four must pass (this is exactly what CI runs):
   `npm run format:check` · `npm run lint` · `npm run typecheck` · `npm test`
4. **Branch**: `feat/…`, `fix/…`, or `docs/…`.
5. **Commit** in [Conventional Commits](https://www.conventionalcommits.org/) style, one logical change per commit.
6. **Tests first** — when changing wizard behavior, update the matching `tests/*.test.ts` before touching code. The suite mirrors `steps/` and `lib/` one-to-one.
7. **Security-sensitive files** (`lib/validate.ts`, `lib/manifest.ts`, `lib/install-modules.ts`) — preserve the validation invariants (regex allowlists, `safeJoin` path guard, `redirect: 'error'`, timeout/size caps, `schemaVersion === 1`) called out in [`CLAUDE.md`](./CLAUDE.md).
8. **Keep docs in sync** — see the [Documentation maintenance](./docs/contributing.md#documentation-maintenance) table.

## Conduct and security

- Be a good citizen — this project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.
- Found a vulnerability? **Do not open a public issue, discussion, or PR** — follow the private disclosure process in [`SECURITY.md`](./SECURITY.md). The CLI sits at a trust boundary (it fetches remote content and writes it into a user's project), so security reports go through coordinated disclosure.

By contributing, you agree your contributions are licensed under the repository's [Apache 2.0 license](./LICENSE).
