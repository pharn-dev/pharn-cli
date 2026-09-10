# REGRESSION — atomic-stale-lock-break

Base: `860fe0bf8ac681298f04938dbc16bb72d9c286b5` (`fix: refuse PAX extended headers rather than
discarding their records (#170)`) — the merge-base of this branch with `origin/main`, passed
explicitly as `--base`. Re-measured after rebasing onto #168/#170/#171; the verdict is unchanged
from the first measurement (which ran against `a382bc3`).

> Why not the auto-detected `HEAD`. `git status --porcelain` was non-empty, which the
> auto-detect reads as "a working-tree dogfood build" → `base = HEAD`. It was non-empty for
> exactly one path — `.pharn/writes-scope.json`, the always-writable stage scratch **this
> command itself writes** in its Step 0. The increment is committed, so the fork point is the
> honest baseline; taking `HEAD` would have compared the tree against itself. Choosing the base
> is orchestration and therefore advisory — the verdict below is not.

## Partition

**Inside** (the changed scope, = the plan's `## Files`, so `scope` exited 0 — no fix #7 breach):

- `src/lib/project-lock.ts`
- `tests/project-lock.test.ts`
- `tests/project-lock-break.test.ts`
- `CHANGELOG.md`

Three further paths differ from the base and are deliberately **not** counted as build writes:
`.pharn/writes-scope.json` (always-writable stage scratch) and
`.dev/features/atomic-stale-lock-break/{PLAN,GRILL}.md` (chain artifacts, each written under its
own command's `writes:` scope, not the build's). Feeding them to `scope` would have raised a
false fix #7 breach against `/pharn-dev-plan`'s and `/pharn-dev-grill`'s own declared writes.

**Outside gates run** — the same set at base and at head:

| gate       | what it runs                                    | base | head |
| ---------- | ----------------------------------------------- | ---- | ---- |
| `tests`    | `node --test` over 46 `*.test.mjs`/`*.test.cjs` | 0    | 0    |
| `validate` | `node .dev/floor/validate.mjs .` (whole-repo)   | 0    | 0    |

748 assertions passed on both sides. `outside_eval_pairs` is empty — no committed eval pair
lives outside this feature.

**Style gates skipped, deterministically.** `lint` / `format:check` / `lint:md` run only when
`inside` touches a shared style config (`eslint.config.mjs`, `.prettierrc.json`,
`.prettierignore`, `.markdownlint-cli2.jsonc`). It touches none, so over the outside files —
byte-identical at base and head — a style result cannot flip. Skipping also avoids the `npm ci`
the baseline worktree would otherwise need. They were run anyway at HEAD as part of the build's
`npm run check`, which was GREEN.

## Verdict

`regressions[]`: none. `pre_existing[]`: none.

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

The honest residual (P0/P7): this catches exactly what its suite catches, nothing more. A
regression no deterministic check covers is invisible to it. And note what the outside suite
here *is* — the 46 stdlib floor/hook tests. The 1181 vitest assertions that cover `src/**` are
**not** in the outside partition (they are not `*.test.mjs`/`*.test.cjs`); they were run at HEAD
by `npm run check` and were green, but this stage did not run them at the baseline, so their
"was green, is green" comparison is not part of this verdict. Stated rather than implied.
