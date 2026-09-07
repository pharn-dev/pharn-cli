# REGRESSION — install-pharn-core

Base: `4eed79a11e6c54b435be3b3c4aea54b297f75bec` (working tree dirty → `base = HEAD`, the dogfood-build
case). The feature's changes are entirely uncommitted, so the baseline worktree is the pre-build state.

## Partition (deterministic, `check-regress.mjs scope` → exit 0)

**Inside (15 changed files)** — every one of them matched a declared `## Files` path, so
`escaped: []`: the build did **not** write outside its plan's scope (the fix #7 cross-check).

`README.md`, `docs/commands/init.md`, `docs/commands/status.md`, `docs/commands/update.md`,
`docs/getting-started.md`, `src/lib/constants.ts`, `src/lib/install-capabilities.ts`,
`src/lib/install-manifest.ts`, `src/lib/layout.ts`, `src/types.ts`, `tests/diff.test.ts`,
`tests/install-capabilities.test.ts`, `tests/install-manifest.test.ts`, `tests/layout.test.ts`,
`tests/update.test.ts`.

`tests/overwrite-check.test.ts` was declared but not written — the suite stayed green without it, so
the plan's conditional entry resolved to "no change needed". A declared-but-unwritten path is not a
scope breach (the scope authorizes, it does not compel).

**Excluded from `--changed`, and why** (stated, not hidden): `.pharn/writes-scope.json` is
always-writable stage scratch that every stage's own Step 0 setter rewrites, and
`.dev/features/install-pharn-core/**` are the stage artifacts each stage wrote under **its own**
declared `writes:`. Neither is a build write, so neither belongs in the fix #7 cross-check. This
exclusion is orchestration (advisory), not part of the verdict.

**Outside gates:** 46 test files (`*.test.mjs` / `*.test.cjs` — the floor's own hermetic tests) plus
whole-repo `validate`. No committed eval pairs exist in this repo, so `outside_eval_pairs: []`.

**Style gates skipped** (deterministic optimization, P5): `inside` touches no shared style config
(`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a style flip
over the byte-identical outside files is provably impossible. Skipped on **both** sides — the gate
set is identical at base and head by construction — and the baseline `npm ci` cost was not incurred.

## Per-gate comparison (`check-regress.mjs verdict` → exit 0)

| gate       | base | head | result |
| ---------- | ---- | ---- | ------ |
| `tests`    | 0    | 0    | OK     |
| `validate` | 0    | 0    | OK     |

`regressions[]`: **empty**. `pre_existing[]`: **empty**.

### One orchestration correction worth recording

The first capture recorded `tests: 1` on **both** sides. That was not a red gate — the Bash tool runs
**zsh**, where an unquoted `$TESTS` does not word-split, so the entire 46-path list was passed to
`node --test` as a single filename ("Could not find '…'"). The gate set was identical either way, so
the verdict would still have read `no-regressions` — but **vacuously**, from a broken invocation on
both sides rather than from a real suite run. It was re-captured via `xargs` and both sides are now
genuinely green. This is exactly the failure mode the two-clocks split warns about: the orchestration
(mine, advisory) can be wrong while the comparison (the helper's, floor) still returns a clean answer.

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`verdict: "no-regressions"`, `check-regress.mjs verdict` exit `0`.)

Honest residual (P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing more.**
The claim is "deterministically-detectable breakage outside the feature is caught," **not** "nothing
broke." A regression no deterministic check covers is invisible here. This certifies the
**comparison**, never the feature as a whole.
