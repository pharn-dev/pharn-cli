# REGRESSION — capability-picker

**Verdict: `no-regressions` — no deterministically-detectable breakage outside the feature. Stage PASSES (exit 0).**

The verdict is floor-grade: `.dev/floor/check-regress.mjs verdict` compared two `{gate-id: exit-code}` maps and found zero pass→fail flips outside the feature. Everything below the verdict (base choice, worktree measurement) is advisory orchestration.

## Base + scope

- **Base:** `a8131a2` (= `origin/main` = `merge-base HEAD origin/main` = HEAD's parent). The environment auto-committed the increment to `feat/capability-picker` (`7f98902`), so the fork point is the true pre-build baseline; the only working-tree entry was `.pharn/writes-scope.json` (scratch), not a feature change.
- **Inside (changed scope, `git diff a8131a2..HEAD`):** the 11 implementation files from `PLAN.md` `## Files` + the feature's own `.dev/features/capability-picker/**` pipeline artifacts. `check-regress.mjs scope` confirmed `inside ⊆ declared` — **no fix #7 escape** (`escaped: []`).
- **Outside gates run:** `tests` (`node --test` over all 45 tracked `*.test.mjs` / `*.test.cjs` floor+hook tests — none are inside the feature) and `validate` (`.dev/floor/validate.mjs .`, whole-repo). **Style gates skipped** (deterministic config-touch rule): the increment touches no shared style config (`eslint.config.mjs` / `.prettierrc` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so a style flip over the byte-identical outside files is provably impossible. No `outside_eval_pairs` (none committed at repo root).

## Per-gate exit codes (base → head)

| gate       | base | head | result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | OK     |
| `validate` | 0    | 0    | OK     |

- `regressions[]`: none
- `pre_existing[]`: none

## Measurement note (advisory orchestration)

Both base and HEAD were measured in **clean detached `git worktree` checkouts** (not the live working tree). Reason: this repo's working tree carries **gitignored `test-*/` fixture installs** (each shipping pharn-oss's deliberately-invalid `floor/test-fixtures/red/skill.md` and fixture `features/`), which pollute the whole-repo `validate` and any tree-scanning floor test with findings that belong to no commit. A `git worktree` checkout contains tracked files only, so measuring **both** sides that way keeps `validate`/`tests` apples-to-apples — the only differences between the two checkouts are the increment's committed changes. (Measured in the live tree, `validate` and `node --test` both go RED at HEAD purely from those fixtures — a measurement artifact, not a feature regression; verified separately.) A first capture pass also hit a zsh word-splitting quirk (the newline-joined test list was passed to `node --test` as one path); re-run with explicit `bash -c` word-splitting, the 45 floor tests genuinely execute and pass at both refs.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. A regression outside the feature that **no** deterministic check covers (a broken behavior with no test/rule/eval) is invisible here. This report certifies **the comparison** (no covered outside gate flipped GREEN→RED), **not** that the increment is whole — that is `/pharn-dev-verify`'s and the human's job. Note also that the CLI's own `vitest` suite is not part of the `node --test` floor `tests` gate; its green status is owned by `/pharn-dev-build`'s `npm run check` (GREEN) and re-checked by `/pharn-dev-verify`.
