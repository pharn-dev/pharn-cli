# REGRESSION — commands-off-manifest

- base: `92afbca` (working tree is dirty — the increment is uncommitted, so `base = HEAD`, per Step 1's deterministic rule)
- **verdict: `no-regressions`** — no deterministically-detectable breakage outside the feature. Stage does NOT fail.

## Inside / outside partition (from `check-regress.mjs scope`; `escaped: []`)

- **inside** — the 49 changed product paths (all `src/`, `tests/`, `docs/`, `CLAUDE.md`, incl. the 11
  deletions). Every changed path is within the plan's `## Files` — **`escaped: []`, no fix #7 scope
  breach.** (The pipeline's own scratch — `.pharn/`, `.dev/features/` — was filtered out of `--changed`
  as it is not feature product.)
- **outside** — 44 `*.test.mjs` / `*.test.cjs` floor-checker + hook tests (`.dev/floor/*`,
  `.claude/hooks/*`), none of which this increment touched; no committed eval pairs.

## Per-gate comparison (base → head exit codes)

| gate    | base | head | flip? |
| ------- | ---- | ---- | ----- |
| `tests` | 1    | 1    | no — RED at both (pre-existing) |

- `regressions[]`: **none**.
- `pre_existing[]`: **`tests`** — the outside `.mjs/.cjs` suite is RED at the `92afbca` baseline too;
  the failing set is **byte-identical** base↔head (`diff` of the `not ok` lines is empty), so nothing
  flipped pass→fail. This is a pre-existing environmental condition in that suite, unchanged by this
  increment (which touched no `.dev/floor/`, no `.claude/hooks/`, and no `*.test.mjs`/`.cjs`).

## Gates deliberately excluded (documented, not silent)

- **`validate` (whole-repo)** — excluded from both maps. Its only findings come from `test-app/`
  (`test-fixtures/red/skill.md`), an **untracked** scratch install absent from the `git worktree`
  baseline (which materializes tracked files only). Comparing base↔head `validate` would compare
  **different file sets** (GREEN in the worktree that lacks `test-app/` vs RED at HEAD) — an invalid
  comparison, not a real signal. This increment changed **zero** capabilities, **zero** `.dev/floor/`,
  and **zero** `test-app/` files, so `validate` provably cannot flip on anything it touched — the same
  "flip is provably impossible → skip from both maps" logic the style-gate skip rule uses.
- **Style gates (`lint` / `format:check` / `lint:md`)** — skipped: `inside` does not touch a shared
  style config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a
  style flip over the byte-identical outside files is provably impossible. (Note: the product suite —
  `npm run check`, vitest + lint + typecheck + format — was run GREEN at HEAD during `/pharn-dev-build`;
  it is not part of `check-regress`'s `node --test` gate set.)

## Honest residual (P0/P7)

`no-regressions` means **the deterministic suite this stage ran flipped nothing outside the feature** —
it does **not** mean "nothing broke." Breakage no deterministic check covers is invisible here; this
stage is exactly as good as the gates it ran (the outside `tests` set + the documented exclusions).
