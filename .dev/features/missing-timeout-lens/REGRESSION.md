# REGRESSION — missing-timeout lens increment

- **Base (pre-build):** `d4a1ce3` (working tree was dirty → `base = HEAD`, the pre-build commit).
- **Scope partition (deterministic, `check-regress.mjs scope`):** `inside` = the 21 files the plan's
  `## Files` declared; **`escaped: []`** — no changed path fell outside the declared writes (fix #7 clean,
  the build did not escape its `## Files`). The `.dev/features/missing-timeout-lens/` pipeline-trace
  artifacts (PLAN/GRILL/reports) are process outputs of other stages (each scope-checked at its own
  write) and are not part of the build's `inside` set — the established sibling convention (`off-by-one`).
- **Style gates skipped (deterministic, P5/P7):** `inside` touches no shared style config
  (`eslint.config.mjs` / `.prettierrc.json` / `.prettierignore` / `.markdownlint-cli2.jsonc`), so a style
  flip over the byte-identical outside files is provably impossible — `lint` / `format:check` / `lint:md`
  are absent from both maps (no `npm ci` incurred).

## Outside-gate comparison (base → head exit codes)

| gate                                                                                   | base | head | result |
| -------------------------------------------------------------------------------------- | ---- | ---- | ------ |
| `tests` (36 outside test files, `node --test`)                                         | 0    | 0    | OK     |
| `validate` (`validate.mjs .`, whole-repo)                                              | 0    | 0    | OK     |
| `structural:trust-fence` (`check-structural` over the committed trust-fence eval pair) | 0    | 0    | OK     |

- **regressions[]:** none
- **pre_existing[]:** none

> Capture note (honesty): a first `tests` capture read exit 1 at **both** base and head — an artifact of
> zsh not word-splitting the space-joined test-file list (`node --test` received all 36 paths as one
> argument, "Could not find"). Re-run with explicit splitting: **520 pass / 0 fail** at head, and the
> same gate green at the baseline worktree. The recorded exit codes above are the corrected ones; the
> artifact never entered the verdict.

## Verdict (deterministic — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.** A
regression outside the feature that no deterministic check (test / rule / eval / `validate`) covers is
invisible here. This verdict certifies the **base→head exit-code comparison** over the outside gates, not
that "nothing broke" in any absolute sense.
