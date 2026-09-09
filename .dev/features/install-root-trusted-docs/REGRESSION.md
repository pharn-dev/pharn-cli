# REGRESSION — install-root-trusted-docs

Base: **`558b8dd`** (`origin/main`, passed as `--baseline`; this branch is rebased onto it, so the base
is the fork point and the comparison is against the same tree CI will merge into).

## Partition (from `.dev/floor/check-regress.mjs scope`)

`escaped: []` — **no scope breach.** Every changed path is inside the plan's `## Files`, including the
build-time amendment that added `README.md` (recorded in `PLAN.md` → "Build-time amendment", re-scoped
through `set-writes-scope.cjs --from-plan`, never by bypassing the hook).

**Inside (13):** `src/lib/constants.ts`, `src/lib/install-capabilities.ts`, `src/lib/install-manifest.ts`,
`src/steps/install-archetype.ts`, `tests/layout.test.ts`, `tests/install-capabilities.test.ts`,
`tests/install-manifest.test.ts`, `tests/init-archetype.test.ts`, `docs/getting-started.md`,
`README.md`, `CHANGELOG.md`, `.dev/features/install-root-trusted-docs/{PLAN,GRILL}.md`.

**Outside gates run:** 46 floor `*.test.mjs` / `*.test.cjs` files (the `tests` gate) + whole-repo
`validate`. `outside_eval_pairs: []` — this repo commits no expected↔actual eval pair.

`.pharn/writes-scope.json` is dirty in the working tree and is **deliberately excluded** from `inside`:
it is per-stage scratch that every stage's Step 0 setter overwrites, `.pharn/**` is always-writable by
`enforce-writes-scope.cjs`, and it is restored before the commit rather than shipped.

## Gate table (exit codes; the only thing the verdict reads)

| gate       | base `558b8dd` | head | flip |
| ---------- | -------------- | ---- | ---- |
| `tests`    | 0              | 0    | none |
| `validate` | 0              | 0    | none |

`regressions: []` · `pre_existing: []`

**Style gates skipped, deterministically (P5).** `inside` touches none of `eslint.config.mjs`,
`.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`, so over the byte-identical outside
files a `lint` / `format:check` / `lint:md` result cannot flip. Absent from **both** maps, so the gate
sets match and the comparison stays conclusive — and the baseline worktree needed no `npm ci`.

## Verdict (floor — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual (P0/P7): this catches **exactly what its suite catches, nothing more.** The claim is
"deterministically-detectable breakage outside the feature is caught", **not** "nothing broke". Note
also what is *inside* and therefore not this stage's business: the feature's own vitest suite is
covered by `/pharn-dev-build`'s `npm run check` (GREEN, 1126 tests) and re-run at `/pharn-dev-verify`.
