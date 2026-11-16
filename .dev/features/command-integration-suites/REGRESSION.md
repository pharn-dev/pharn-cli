# REGRESSION — command-integration-suites

- base: `a4bbcb93335b85969f24b18de8f27e13aeb14d59` (merge-base with origin/main)
- inside: the 33 paths in `regression-report.json` `.inside` — all `tests/**`, `vitest.config.ts`
  and `docs/contributing.md`, every one declared in PLAN.md `## Files` (`scope` exit 0, nothing escaped)
- outside gates (identical set at base and HEAD):
  - `tests` — `node --test` over the 47 `*.test.mjs` / `*.test.cjs` floor/hook tests: base 0, head 0
  - `validate` — `node .dev/floor/validate.mjs .`: base 0, head 0
- style gates skipped: no shared style config (`eslint.config.mjs`, `.prettierrc.json`,
  `.prettierignore`, `.markdownlint-cli2.jsonc`) is inside.

Verdict (`check-regress.mjs verdict`, verbatim): **no-regressions**.

Residual (named): this catches only what its gates cover. The vitest suite itself is inside the
feature (it is what changed), so it is checked by `/pharn-dev-verify` and by `npm run check` run at
every commit of the branch (all six green), not here.
