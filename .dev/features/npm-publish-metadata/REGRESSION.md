# REGRESSION — npm-publish-metadata

- Feature: `npm-publish-metadata` (rename package to `pharn` + publish metadata; 4 files).
- Base: **HEAD** (working-tree dogfood build). See the baseline-confound note below.
- Inside (changed scope): `package.json`, `README.md`, `CHANGELOG.md`, `CLAUDE.md` — `git status` shows only these 4 tracked files modified; the `escaped` set is empty (`check-regress.mjs scope` exit 0 — the build did **not** leave its `## Files`).
- Outside universe: 44 tracked floor/hook tests (`*.test.mjs` / `*.test.cjs`); **0** committed eval pairs.

## Per-gate exit codes (base → head)

| gate | base | head | class |
| --- | --- | --- | --- |
| `tests` (44 floor/hook tests via `node --test`) | 1 | 1 | **pre_existing** |

**Deterministic verdict (`check-regress.mjs verdict`): `no-regressions` — exit 0.** `regressions: []`, `pre_existing: [tests]`.

## Why the `tests` gate is pre_existing, not a regression (the baseline confound — disclosed, not hidden)

The default base-selection (working-tree dirty → `base = HEAD`, captured in a fresh `git worktree`) is **confounded in this repo** and I corrected it, transparently:

- A fresh `git worktree` of HEAD does **not** contain the gitignored `test-*/` scratch installs (test-backend/edge/edge2/full/lib/next/spa). My working tree **does**.
- Three tests in `.dev/floor/lens-scanner-map.test.mjs` count **live** capabilities across the tree. With the scratch installs present the live lens count is **142** (`map key count must equal the live lens count: 0 !== 142`), plus `scan-code-copy-paste-drift.mjs` reads as an unwired scanner. In a clean worktree (no scratch) they pass.
- So the raw worktree comparison showed `tests` flipping **0 (clean worktree) → 1 (my working tree)** — which the helper would mislabel a regression. That flip is caused by **untracked, gitignored scratch installs that a fresh checkout strips**, not by this increment.

**Feature-isolating proof (scratch held constant).** I re-ran the identical suite with my 4 tracked changes stashed (`git stash push -- package.json README.md CHANGELOG.md CLAUDE.md`) while the untracked scratch stayed in place:

- BASE (my changes reverted, scratch present): **exit 1, 3 fails, all in `lens-scanner-map.test.mjs`**.
- HEAD (my changes present, scratch present): **exit 1, 3 fails, same file**.

Identical. My increment changed **no** `src/`, `tests/`, floor, hook, or capability file (`git diff` = the 4 docs/config files only), so it has **zero** effect on these floor tests. The honest baseline therefore holds the scratch constant → base `tests = 1` == head `tests = 1` → **pre_existing** (already red at baseline, per `check-regress.mjs`'s own definition — "not the feature's fault"). Verdict: `no-regressions`.

(The `validate.mjs .` whole-repo gate is the same scratch-pollution story — RED at both base and head — and was excluded from the compared set because a fresh worktree strips the scratch it measures; it is pre_existing under a scratch-constant baseline, never a flip caused by this increment.)

## The CLI's real suite (named residual, P0/P7)

`/pharn-dev-regress`'s `--tests` glob (`*.test.mjs`/`*.test.cjs`) targets the **methodology floor** tests, not the pharn **vitest** suite (`tests/*.test.ts`, run by `npm run check`). That vitest suite is this increment's true regression surface. It is **byte-identical at base and head** — the diff touches no `src/` or `tests/` file — so a flip is provably impossible (the same reasoning `/pharn-dev-regress` uses to skip style gates over byte-identical files). It was also run directly at HEAD during build: **`npm run check` GREEN, 378/378 tests pass.**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The one outside gate that ran is `pre_existing` (scratch-install pollution, proven present with or without this increment); the CLI vitest suite is byte-identical and independently GREEN.

**Honest residual:** `/pharn-dev-regress` catches exactly what its suite catches — nothing more. The pre-existing `lens-scanner-map` / `validate` scratch pollution is a **repo-hygiene issue** for the dev-loop (the floor scans should exclude gitignored scratch trees), surfaced here and at grill; it is **out of scope** for this packaging increment and is flagged for the human, not fixed here.
