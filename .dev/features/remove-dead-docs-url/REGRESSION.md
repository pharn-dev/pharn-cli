# REGRESSION — remove-dead-docs-url

**Verdict (FLOOR, `check-regress.mjs verdict`):** `no-regressions` — exit `0`.

Pure exit-code comparison of the outside gate set at the baseline and at HEAD, zero LLM judgment.

## Base + scope partition

- **base:** `b680a99` (`b680a990d25b54ca8096aa2e64c56468e1b464b6`) — current HEAD. Working tree is dirty (the feature's 3 uncommitted src edits), so per the deterministic base rule `base = HEAD` and the diff is taken against the working tree.
- **inside (declared `## Files`, 3):** `src/lib/constants.ts`, `src/steps/install.ts`, `src/steps/install-archetype.ts`. `scope` exit `0`, `escaped: []` — the build stayed within its declared writes (fix #7).
- **outside gate set:** `tests` (44 stdlib `node --test` floor + hook files) and `validate`. Style gates skipped — `inside` touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`). No outside eval pairs (`pharn` ships no committed lens/griller eval pairs at repo root).

## Per-gate base → head (exit codes)

| gate       | base | head | classification |
| ---------- | ---- | ---- | -------------- |
| `tests`    | 1    | 1    | **pre_existing** (RED→RED, not a flip) |
| `validate` | 0    | 0    | clean (GREEN→GREEN) |

`regressions[]`: **none**. `pre_existing[]`: `tests`.

## Why the `tests` gate is RED at baseline (not this feature)

The `tests` aggregate is red **independently of this increment** — it is red with my edits and red with them reverted. The failing file is `.dev/floor/lens-scanner-map.test.mjs`, which is **explicitly non-hermetic** (its own header: "UNLIKE the other floor tests … this one validates the COMMITTED artifact against REALITY"): it runs `count-lenses.mjs` over the **repo root**, which recursively includes the gitignored `test-app/` install fixture. `count-lenses .` returns **22 lenses, all under `test-app/pharn-review/…`** (copy-paste-drift, duplicated-logic, injection, …), while the committed `lens-scanner-map.json` is intentionally empty (`"scanners": {}` — "pharn ships no product lenses today"). 22 ≠ 0 ⇒ the test asserts, and `node --test` exits non-zero.

- **This has nothing to do with `DOCS_URL`.** No `node --test` file imports or reads any of my 3 changed `src/*.ts` files (only the vitest `tests/*.test.ts` suite does — and that ran GREEN, 594/594, at build). Removing `DOCS_URL` cannot move the lens count.
- **A first (worktree) capture read 0→1 — a measurement artifact, corrected.** The command's `git worktree` baseline checks out only tracked files, so the gitignored `test-app/` is absent there → `count-lenses` finds 0 → the lens test passes → `tests` = 0 at that base, while HEAD (working tree, `test-app` present) = 1. That 0→1 is an **apples-to-oranges** difference in *environment* (fixture present/absent), not a feature effect, so it was discarded.
- **The reported base is measured soundly, same-environment.** Base and head were both measured in the working tree (so `test-app` is present on both sides), differing **only** by the 3 src edits — reverted in place via a guarded `git stash` for the base run, then restored (verified: edits intact). Under that apples-to-apples comparison `tests` is `1 → 1` (RED→RED, pre-existing), which is the honest classification and matches the prior `archetype-path-context` src-only feature.

## Honest residual (P0/P7)

`/pharn-dev-regress` catches exactly what its deterministic suite catches — nothing more. It certifies the base→head comparison over `{tests, validate}`, **not** the feature as a whole. The pre-existing `lens-scanner-map` drift (a non-hermetic floor test counting fixture lenses under `test-app/`) is surfaced here but is **out of this increment's scope** — it predates this feature and is unrelated to it.
