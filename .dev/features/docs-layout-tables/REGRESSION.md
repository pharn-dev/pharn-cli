# REGRESSION — docs-layout-tables

- base: `7d96bbca2186d835b539e09abb3beaac470291d3` (`origin/main`, merge-base) · machine report: `regression-report.json`

Base captured in a detached worktree at the merge-base with `node_modules` symlinked from the shared
checkout; head captured in this worktree. Six gates each run, exit codes recorded verbatim. Result
files carry feature-unique names (`docs-layout-tables.base.json` / `.head.json`) so a concurrent
agent's capture cannot collide with this one.

`--inside`: `README.md`, `CHANGELOG.md`, `docs/getting-started.md`, `docs/commands/init.md`,
`docs/commands/status.md`, `tests/docs-install-tables.test.ts` — byte-identical to the plan's
`## Files`.

| gate           | base | head |
| -------------- | ---- | ---- |
| `test`         | 0    | 0    |
| `lint`         | 0    | 0    |
| `typecheck`    | 0    | 0    |
| `format:check` | 0    | 0    |
| `lint:md`      | 0    | 0    |
| `validate`     | 0    | 0    |

`test` at head runs 1077 tests across 53 files (base: 1072 across 52) — the five new assertions are
the whole delta.

## Verdict (FLOOR — exit 0): `no-regressions`

`regressions: []`, `pre_existing: []`. Honest scope (P0): this is a deterministic comparison of six
exit codes, so it catches exactly what those six gates catch. A documentation claim that is wrong but
syntactically valid was invisible to all six before this increment — that gap is why
`tests/docs-install-tables.test.ts` exists, and it is still only as wide as the path set it derives.
