# REGRESSION — remove-prunes-records

Base: **`21db522c0fe23c30c53510b954cccd4e34662e83`** (`21db522`, the tip of `main`). Resolved by the
deterministic state test in Step 1: `git status --porcelain` is non-empty (a working-tree dogfood
build), so `base = HEAD`. The baseline was measured in a detached `git worktree` at that SHA — a
non-destructive, reproducible checkout — and removed afterwards.

## Partition

**Inside (the changed scope)** — 6 paths, exactly the plan's `## Files`, `escaped: []`:

```text
CHANGELOG.md
CLAUDE.md
docs/commands/remove.md
docs/reference/pharn-records.md
src/commands/remove.ts
tests/remove.test.ts
```

**Outside gates:** 46 test files (every `*.test.mjs` / `*.test.cjs` under `.dev/floor/` and
`.claude/hooks/`), plus whole-repo `validate`. **0 committed eval pairs** exist in this repo today —
the only `evals/expected/` directory on disk is `.dev/floor/test-fixtures/green/`, a fixture rather
than a capability — so `outside_eval_pairs` is empty and no `structural:*` gate ran. Stated so the
absence is not read as "the eval gates passed."

### Two paths excluded from `--changed`, named rather than silently dropped

`git diff` also reports `.pharn/writes-scope.json` and the untracked
`.dev/features/remove-prunes-records/{PLAN,GRILL}.md`. Run with the **raw** list, `scope` exits **1**
with three blocking fix#7 findings claiming the build escaped its `## Files`. That reading is false,
and both halves of why are checkable:

- `.pharn/**` is **always-writable pipeline scratch** by `enforce-writes-scope.cjs`'s own rule (this
  command's Step 0 states it); the file was rewritten by `set-writes-scope.cjs` at every stage of this
  run, including twice by `/pharn-dev-regress` itself. It is stage scratch, never build output.
- `.dev/features/remove-prunes-records/PLAN.md` and `GRILL.md` are **this run's own stage artifacts**,
  each written under **its** stage's writes-scope (`/pharn-dev-plan`'s and `/pharn-dev-grill`'s
  respectively), never under the build's. `/pharn-dev-build`'s scope was pinned to exactly the 6 paths
  above and the hook enforced it.

**The exclusion cannot hide a regression, and that is verifiable rather than asserted:** none of the
three is a test file or an eval-pair file, so `outside_tests` (46) and `outside_eval_pairs` (0) are
**byte-identical** under both runs — the exclusion moves no gate between partitions. It changes only
whether a false scope-breach is reported. Both scope runs were executed and both are reported here;
the partition step is **advisory orchestration** (the verdict below is not).

Style gates (`lint` / `format:check` / `lint:md`) were **skipped** by the deterministic config-touch
rule: `inside` touches none of `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`, so over the outside files — byte-identical at base and head — a style flip
is provably impossible. They are absent from **both** result maps, so the gate sets match.

## Gate results (exit codes, base → head)

| gate       | base | head | outcome |
| ---------- | ---- | ---- | ------- |
| `tests`    | 0    | 0    | OK      |
| `validate` | 0    | 0    | OK      |

`regressions[]`: **empty** · `pre_existing[]`: **empty** (nothing was already red at the baseline).

## Verdict (FLOOR — `.dev/floor/check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

The verdict is a deterministic comparison of the two exit-code maps above; no model judgment enters it,
and no free-text field was read. What I did around it — resolving the base, partitioning
inside/outside, running the suite — is **advisory orchestration**.

**The honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing
more.** A regression that no deterministic check covers is invisible here. This says
"deterministically-detectable breakage outside the feature is caught", **not** "nothing broke", and it
certifies **only the comparison** — never the feature as a whole.
