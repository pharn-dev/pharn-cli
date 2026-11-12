# REGRESSION — core-170-one-sanitizer

- base: `acac112132fd379785196edc32b357f0ee7ce72b` (merge-base with origin/main); head: `09a6c47`
- inside (the changed scope, all within the PLAN's `## Files`; `scope` reported no escape): CHANGELOG.md, CLAUDE.md, THREAT-MODEL.md, src/lib/{install-records,pharn-config,terminal-safe,update-render,validate}.ts, tests/{commands-integration,pharn-config,tar-extract,terminal-safe,update-render,validate}.test.ts
- outside gates (identical at base and head): `tests` (`node --test` over the outside `*.test.mjs`/`*.test.cjs`), `validate` (`node .dev/floor/validate.mjs .`). Style gates skipped: no shared style config changed.

| gate | base | head |
| --- | --- | --- |
| tests | 0 | 0 |
| validate | 0 | 0 |

Regressions: none. Pre-existing failures: none.

Verdict (`check-regress.mjs`, verbatim): **no-regressions**.
