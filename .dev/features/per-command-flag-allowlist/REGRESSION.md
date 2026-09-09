# REGRESSION — per-command flag allowlist (audit P-13)

**Base:** `377e1f5fe30b8d43903a9305272a929393ed9b8e` — resolved by the deterministic rule, not chosen:
`git status --porcelain` was non-empty (a working-tree build), so `base = HEAD`.

## Partition (computed by `check-regress.mjs scope`, exit 0)

**Inside (7 changed paths)** — every one of them declared in the plan's `## Files`:

`CHANGELOG.md`, `CLAUDE.md`, `docs/commands/init.md`, `docs/commands/remove.md`,
`docs/troubleshooting.md`, `src/index.ts`, `tests/index.test.ts`

**`escaped: []`** — the build wrote nothing outside the scope `/pharn-dev-build` was pinned to (fix #7).

**Outside gates:** 46 `*.test.mjs` / `*.test.cjs` files (the `.dev/floor/*` checkers, the lens/plan
scanners, and the three `.claude/hooks/*` hook tests) plus whole-repo `validate`.
**`outside_eval_pairs: []`** — this repo commits no expected↔actual eval pair.

## Gate results

| gate       | base | head |
| ---------- | ---- | ---- |
| `tests`    | 0    | 0    |
| `validate` | 0    | 0    |

**Style gates were SKIPPED at both sides** by the deterministic config-touch rule: `inside` touches
none of `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`, so a style
result over the byte-identical outside files could not flip. They are absent from **both** maps, so
the gate sets match.

`regressions: []` · `pre_existing: []`

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` → `"no-regressions"`, exit 0. The comparison is the guarantee; running
it, and the choice of base and partition, is advisory orchestration.)

**Residual, named not hidden (P7):** this catches exactly what the suite catches — nothing more. The
46 outside tests are the floor checkers and hook tests; none of them imports `src/index.ts`, so this
run's real assurance about the changed file comes from the **inside** suite (`npm run check`, 1149
vitest tests GREEN at build), not from this comparison. The claim here is "no
deterministically-detectable breakage outside the feature", **not** "nothing broke."
