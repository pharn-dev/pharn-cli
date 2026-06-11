# Contributing to pharn-cli

Thanks for your interest in improving PHARN. The full contributor guide lives in [`docs/contributing.md`](./docs/contributing.md) — start there.

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

This project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

By contributing, you agree your contributions are licensed under the repository's [Apache 2.0 license](./LICENSE).
