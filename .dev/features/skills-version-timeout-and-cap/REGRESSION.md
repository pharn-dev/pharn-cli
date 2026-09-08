# REGRESSION — skills-version-timeout-and-cap

**Verdict (FLOOR, `node .dev/floor/check-regress.mjs verdict` → exit 0):
`no-regressions` — no deterministically-detectable breakage outside the feature.**

Machine report: `.dev/features/skills-version-timeout-and-cap/regression-report.json` (the helper's
stdout verbatim).

## Base

`2db65631d1243c96b75e19281b6ad19ea1d81722` — resolved by the deterministic state test in Step 1:
`git status --porcelain` is non-empty (a working-tree build), so `base = HEAD`. The baseline was
measured in a detached `git worktree` at that SHA, removed afterwards.

## Partition

`inside` (the changed product scope, and exactly the plan's `## Files` — `escaped: []` from
`check-regress.mjs scope`, exit 0):

- `src/lib/skills-version.ts`
- `tests/skills-version.test.ts`
- `CHANGELOG.md`

Also modified this run but deliberately NOT passed as `--changed`, because they are not build
writes: `.pharn/writes-scope.json` (always-writable dev-loop scratch, named as such in
`enforce-writes-scope.cjs` and in `/pharn-dev-regress` Step 0's own caveat) and
`.dev/features/skills-version-timeout-and-cap/{PLAN.md,GRILL.md}` (the `/pharn-dev-plan` and
`/pharn-dev-grill` stages' own declared `writes:`, each gated by the same hook under its own scope).
Passing them would report the plan stage as a build escape. Stated rather than silently filtered.

`outside_tests`: 46 stdlib `node --test` files (`.claude/hooks/*.test.cjs`, `.dev/floor/*.test.mjs`).
`outside_eval_pairs`: none — this repo commits no eval pairs.

## Gates (identical set both sides — exit codes only, never stdout)

| gate       | base | head | flip |
| ---------- | ---- | ---- | ---- |
| `tests`    | 0    | 0    | no   |
| `validate` | 0    | 0    | no   |

Style gates (`lint` / `format:check` / `lint:md`) were **skipped by the deterministic rule**: `inside`
touches no shared style config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
`.markdownlint-cli2.jsonc`), so over the byte-identical outside files a style result cannot flip. They
are absent from **both** maps, so the gate sets match and the verdict is not `inconclusive`. (They were
run anyway during the build's own floor — `npm run check` GREEN — but that is the inside gate, not
this comparison.)

`regressions[]`: empty. `pre_existing[]`: empty.

## Honest residual (P7)

`/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** This says
deterministically-detectable breakage outside the feature is absent; it does **not** say nothing
broke. In particular, the outside suite here is the dev-loop's own stdlib floor tests: the product's
own regression protection is `npm run check`'s vitest run, which is an **inside** gate and reported
GREEN by `/pharn-dev-build` (892 tests), not by this comparison.

One measurement note worth recording rather than hiding: the first baseline/HEAD capture reported
`tests: 1` on **both** sides. That was not a failure but a shell artifact — zsh does not word-split an
unquoted parameter expansion, so the 46 test paths reached `node --test` as one argument
(`Could not find '<all 46 joined>'`). Re-run with the list split correctly, both sides are 0. The
comparison would have been *correct* either way (identical on both sides → no flip), but it would
have been measuring nothing.
