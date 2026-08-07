# REGRESSION — add-version-gate

**Base:** `135406a0204f4ad6af99e49e1e847dcf0d11c862` (`feat: pharn update is drift-safe by default (#74)`)
— resolved by the deterministic state test: `git status --porcelain` was non-empty (a working-tree
dogfood build), so `base = HEAD`.

## Partition (floor: `check-regress.mjs scope` → exit 0, `escaped: []`)

**Inside** (the feature's changed scope, ⊆ the plan's `## Files` — no fix #7 escape):

- `src/commands/add.ts`
- `tests/add.test.ts`
- `docs/commands/add.md`
- `docs/commands/status.md`
- `CLAUDE.md`
- `CHANGELOG.md`

**Outside:** 44 test files (`.dev/floor/*.test.mjs` + `.claude/hooks/*.test.cjs`), 0 committed eval
pairs (`git ls-files '*/evals/expected/*.json'` is empty — pharn-cli owns no markdown capability).

**Three changed paths were excluded from `--changed` by provenance, not by judgment.** Each is a
pipeline stage's own artifact, written under that stage's own writes-scope — not by `/pharn-dev-build`:

| Path                                        | Written by         | Declared in                                    |
| ------------------------------------------- | ------------------ | ---------------------------------------------- |
| `.dev/features/add-version-gate/PLAN.md`    | `/pharn-dev-plan`  | its `writes: [".dev/features/<name>/PLAN.md"]`  |
| `.dev/features/add-version-gate/GRILL.md`   | `/pharn-dev-grill` | its `writes: [".dev/features/<name>/GRILL.md"]` |
| `.pharn/writes-scope.json`                  | `set-writes-scope.cjs` | always-writable scratch (`enforce-writes-scope.cjs`) |

Feeding these to the fix #7 cross-check would have manufactured a false "the build escaped its
`## Files`" finding. The build's own changed set is **exactly** the six declared files.

## Gate set and results

Style gates (`lint` / `format:check` / `lint:md`) were **skipped** by the deterministic config-touch
rule: `inside` touches none of `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`, so a style flip over the byte-identical outside files is provably
impossible. They are absent from **both** maps, so the gate sets match.

| Gate       | base | head | flip |
| ---------- | ---- | ---- | ---- |
| `tests`    | 0    | 0    | none |
| `validate` | 0    | 0    | none |

`tests` = `node --test` over all 44 outside files: **665 tests, 665 pass, 0 fail** at base and at
head — the same counts on both sides.

### Two orchestration corrections made during the capture (both would have produced a false reading)

1. **`validate.mjs` was measured in tracked-files-only worktrees on both sides.** In the live working
   directory `validate.mjs` exits **1**, but every one of its 15 blocking findings sits inside a
   gitignored `test-*/` local fixture install (pharn-oss's own deliberately-red
   `floor/test-fixtures/red/skill.md`, copied in by `npm run build:install-local`). A `git worktree`
   checkout contains no untracked files, so comparing a worktree baseline against the live working
   tree would have read `0 → 1` and reported a **fabricated regression** caused purely by the
   checkout's file universe. Both sides were therefore run as worktrees at the same tracked state
   (base, and base + the applied diff), which is apples-to-apples. On tracked source `validate` is
   **GREEN (0 capabilities checked)** on both sides — vacuously green, as expected for a TypeScript
   increment that adds no markdown capability.
2. **The first `tests` capture ran zero tests.** The shell is zsh, which does not word-split unquoted
   parameter expansions, so `node --test $TESTS` passed all 44 paths as a single filename and both
   sides returned `1` ("Could not find …"). Identical on both sides, so it would not have flipped the
   verdict — but it would have meant the `tests` gate contributed **no coverage** while appearing in
   the report as a gate that ran. Re-captured with a proper array (`"${TESTS[@]}"`); the 665/665
   counts above are from that re-run.

## Verdict (FLOOR — `check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

`regressions: []`, `pre_existing: []`, `verdict: "no-regressions"`.

**The honest residual (P0/P7).** This catches **exactly what its suite catches, nothing more.** The
outside suite here is the floor's own 44 stdlib test files; a breakage outside the feature that no
deterministic check covers is **invisible** to this stage. The claim is "deterministically-detectable
breakage outside the feature is caught" — **not** "nothing broke." Note also that the repo's own
`vitest` suite is *inside*-scoped for this feature (`tests/add.test.ts` changed), so its 552 passing
tests are `/pharn-dev-build`'s and `/pharn-dev-verify`'s evidence, not this stage's.

Only the **comparison** is a guarantee. Choosing the base, partitioning inside/outside, and running
the suite were all orchestration — advisory, and corrected twice above.
