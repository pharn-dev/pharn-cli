# REGRESSION — canonical-npm-name

- **Base:** `HEAD` (working-tree dogfood build; `git status --porcelain` non-empty → base = HEAD).
- **Verdict (floor, `check-regress.mjs verdict`):** `no-regressions` — no deterministically-detectable breakage outside the feature.

## Inside (the changed scope — 10 files, all declared in PLAN `## Files`)

`.github/ISSUE_TEMPLATE/bug_report.md`, `CHANGELOG.md`, `README.md`, `SECURITY.md`,
`docs/contributing.md`, `docs/getting-started.md`, `docs/troubleshooting.md`, `package.json`,
`src/index.ts`, `src/steps/prereqs.ts`.

`scope` (fix #7) confirmed `escaped: []` — the build wrote nothing outside its declared `## Files`.

## Outside gates (base → head exit codes)

| Gate | base | head | classification |
| --- | --- | --- | --- |
| `tests` (`node --test` over 44 floor/hook `*.test.mjs`/`*.test.cjs`) | 1 | 1 | **pre-existing** |
| `validate` (`node .dev/floor/validate.mjs .`, whole-repo) | 1 | 1 | **pre-existing** |

- `regressions[]`: **(none)**
- `pre_existing[]`: `tests`, `validate`

## Why both gates are pre-existing (not caused by the rename)

Both gates are RED at the **baseline** (the 10 files reverted to HEAD) as well as at HEAD, so
`check-regress.mjs` excludes them as pre-existing (`base != 0` is never blamed on the feature). The
red is entirely the **gitignored `test-*/` install dirs** present in the working tree:

- `validate.mjs .` flags deliberately-red fixtures under `test-*/pharn/floor/test-fixtures/red/`.
- the `tests` gate's 3 failures are all in `lens-scanner-map.test.mjs`, which scans the **live** tree
  and trips on the lenses/scanners installed inside `test-*/`.

Neither depends on the 10 renamed files (docs + `package.json` name + two `src/` string literals); the
rename cannot affect the floor/hook `node --test` suite or capability `validate`, and the `src/` change
is covered green by the build's `npm run check` (vitest, 378 passed).

## Baseline methodology note (honest)

The baseline was captured by a **surgical in-place revert of only the 10 files** (`git checkout HEAD -- <files>`)
with the gitignored `test-*/` + `node_modules` left in place, so base↔head differ **solely** by the
rename. A `git worktree` baseline was rejected: it produces a clean checkout **without** the gitignored
`test-*/` dirs, so the whole-repo gates falsely flip GREEN→RED on the environment difference rather than
on the change.

## Residual (P0/P7)

`/pharn-dev-regress` catches exactly what its suite catches — nothing more. Because the `tests` and
`validate` gates are already red at baseline (test-*/ noise), a *new* failure they cover would be masked
(both sides non-zero → classified pre-existing). That masking does not apply to this increment: the
rename cannot touch the floor/hook suite or capability structure, and its `src/` effect is verified by
the build's green vitest run. The verdict certifies the **comparison**, not that the increment is whole.

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
