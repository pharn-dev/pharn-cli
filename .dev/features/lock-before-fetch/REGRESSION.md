# REGRESSION — lock-before-fetch

**VERDICT: `no-regressions`** — computed by `.dev/floor/check-regress.mjs verdict`, exit 0. The
verdict is a deterministic exit-code comparison over the outside-scoped gates; no model judgment
enters it.

## Base

`377e1f5fe30b8d43903a9305272a929393ed9b8e` — resolved by the state test in Step 1: `git status
--porcelain` was non-empty (a working-tree dogfood build), so `base = HEAD`. The baseline was
checked out with `git worktree add --detach` at that immutable SHA and the gates run inside it; the
HEAD side ran in the working tree.

## Scope partition

`.dev/floor/check-regress.mjs scope` exited **0** with **`escaped: []`** — every changed path is
inside the plan's declared `## Files`, so the build did not leave its fix-#7 scope.

Inside (7): `CHANGELOG.md`, `src/commands/{add,init,update}.ts`,
`tests/{add,project-lock-commands,update}.test.ts`.

## Outside gates (identical set both sides)

| gate | base exit | head exit | flip |
| --- | --- | --- | --- |
| `tests` (46 floor/hook suites, 748 assertions) | 0 | 0 | none |
| `validate` (`.dev/floor/validate.mjs .`) | 0 | 0 | none |

`outside_eval_pairs` was empty — no committed eval pair lies outside this feature.

**Style gates were skipped, deterministically and not by preference.** The skip rule fires when
`inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`); it touches none, so over the outside files — byte-identical at base and
head — a style result cannot flip. Skipped on both sides, so the gate sets still match and the
verdict is not `inconclusive`. (They were nevertheless run whole-repo at build time as part of
`npm run check`, and were green.)

## What this does and does not say

It says: nothing **outside** the changed scope that was passing at `377e1f5` is failing now.

It does not say the increment is correct — that is `/pharn-dev-verify`'s floor gates and
`/pharn-dev-review`'s advisory lenses. A named granularity limit carries over from the command:
`validate` is whole-repo rather than outside-only, so an inside-caused `validate` break would be
attributed here; it did not fire, and `/pharn-dev-build` had already halted on a red `validate`.
