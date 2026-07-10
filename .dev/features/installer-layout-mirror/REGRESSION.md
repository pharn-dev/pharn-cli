# REGRESSION — installer-layout-mirror

**Verdict (FLOOR, `check-regress.mjs verdict`):** `no-regressions` — exit `0`. Pure exit-code comparison, zero LLM judgment.

## Base + scope partition

- **base:** `b739a6f` — current HEAD (working tree dirty with the feature's uncommitted changes, so `base = HEAD` and the diff is against the working tree).
- **inside (declared `## Files`, 17):** the 10 src files + 7 test files of the increment. `scope` exit `0`, `escaped: []` — the build stayed within its declared writes (fix #7). `.pharn/` scratch and the feature-artifact dir are pipeline bookkeeping, correctly excluded from `--changed`.
- **outside gate set:** `tests` (44 stdlib `node --test` floor + hook files) and `validate`. Style gates skipped — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`). No outside eval pairs.

## Per-gate base → head (exit codes)

| gate       | base | head | classification |
| ---------- | ---- | ---- | -------------- |
| `tests`    | 1    | 1    | **pre_existing** (RED→RED, not a flip) |
| `validate` | 0    | 0    | clean (GREEN→GREEN) |

`regressions[]`: **none**. `pre_existing[]`: `tests`.

## Why the `tests` gate is RED at baseline (not this feature)

Identical to the previously-shipped `remove-dead-docs-url` increment: the `tests` aggregate is red **independently of this increment** — red with the feature's edits and red with them reverted (measured same-environment). The failing file is `.dev/floor/lens-scanner-map.test.mjs`, which is explicitly **non-hermetic** — it runs `count-lenses.mjs` over the repo root, which recursively includes the gitignored `test-app/` install fixture (22 lenses there vs the committed empty `lens-scanner-map.json`). This increment touches only `src/*.ts` and vitest `tests/*.test.ts` — **no** `.mjs`/`.cjs` node test and **no** PHARN markdown capability, so it provably cannot move the `tests` or `validate` exit codes.

- **Sound, same-environment measurement.** Base and head were both measured in the working tree (so gitignored `test-app/` is present on both sides), differing only by the feature's tracked edits — reverted in place via a guarded `git stash`, then restored (verified). The `git worktree` baseline the command sketches is confounded here (the worktree omits gitignored `test-app/`, manufacturing a phantom `0→1` flip); the same-environment measurement is the apples-to-apples comparison the regress guarantee requires, and it yields `tests` `1 → 1` (pre-existing).

## Honest residual (P0/P7)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. It certifies the base→head comparison over `{tests, validate}`, **not** the feature as a whole. The feature's real correctness surface (the vitest suite, incl. the new layout/install/diff/status/remove/config tests) is owned by `/pharn-dev-verify`'s `test` gate, not this stage. The pre-existing `lens-scanner-map` drift is out of this increment's scope.
