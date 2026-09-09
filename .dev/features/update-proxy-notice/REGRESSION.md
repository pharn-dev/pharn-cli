# REGRESSION — update-proxy-notice

Did building this increment break anything **outside** the feature? The verdict below is computed by
`.dev/floor/check-regress.mjs`, not by this stage's judgment: a gate that flipped `pass → fail` **is**
a regression because the helper says so.

## Base and partition

- **base:** `11f04d48102887962211272662a677c95cb3080b` — resolved deterministically: `git status
  --porcelain` was non-empty (a working-tree dogfood build), so `base = HEAD` per the state test.
- **inside** (the changed scope, all three declared in `PLAN.md` `## Files`):
  - `src/commands/update.ts`
  - `tests/update.test.ts`
  - `CHANGELOG.md`
- **scope partition:** `check-regress.mjs scope` exited **0** — `escaped: []`, no fix #7 finding. The
  build did not write outside its plan's `## Files`.
- **outside gates:** 46 stdlib test files (`*.test.mjs` / `*.test.cjs` under `.claude/hooks/` and
  `.dev/floor/`) plus whole-repo `validate`. **0 outside eval pairs** — none are committed in this
  repo today.

The `.dev/features/update-proxy-notice/` artifacts (`PLAN.md`, `GRILL.md`, and this file) are **not**
counted as changed scope: each pipeline stage writes its own artifact under its own writes-scope
(the documented per-stage propagation), so they are not the *build* escaping its `## Files`. This
matches how the sibling `status-proxy-notice` run scoped the same question.

## Style-gate skip (deterministic, P5/P7)

`lint` / `format:check` / `lint:md` were **skipped at both sides**, and are absent from both results
maps. The skip rule is a membership test, not a judgment: they run only if `inside` touches a shared
style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`). It touches none, and every outside file is byte-identical at base and
head, so a style result there could not flip. (They were run anyway as part of `npm run check` at
HEAD during `/pharn-dev-build`, and were green — but that is the *inside* story, not this gate's.)

## Per-gate exit codes

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`regression-report.json` `.verdict` = `no-regressions`; helper exit **0**.)

**The honest residual (P0/P7):** this stage catches **exactly what its suite catches, nothing more.**
The claim is "deterministically-detectable breakage outside the feature is caught" — **not** "nothing
broke." A regression no deterministic check covers is invisible here. In particular, the outside gate
set is stdlib tests + `validate`; the vitest suite that actually exercises `src/commands/**` is
**inside** scope for this increment and is owned by `/pharn-dev-build`'s floor and `/pharn-dev-verify`,
not by this comparison.

This certifies **the comparison**, never the increment.
