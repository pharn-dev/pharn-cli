# REGRESSION — `security-md-tarball-path`

**Base:** `377e1f5fe30b8d43903a9305272a929393ed9b8e` (`main` @ `377e1f5`). Resolved by the
deterministic state test in Step 1: `git status --porcelain` was **non-empty** (a working-tree
dogfood build), so `base = HEAD` and the comparison is pre-build tree vs post-build tree.

## Partition (from `check-regress.mjs scope`, not from judgment)

| | |
| --- | --- |
| `inside` (changed) | `SECURITY.md`, `CHANGELOG.md` |
| `declared` (`PLAN.md` `## Files`) | `SECURITY.md`, `CHANGELOG.md` |
| `escaped` | **`[]`** — the build did not write outside its `## Files` (no fix #7 breach) |
| `outside_eval_pairs` | `[]` — this repo commits none |

`scope` exited **0**. The stage artifacts under `.dev/features/security-md-tarball-path/` and the
`.pharn/writes-scope.json` churn are stage scratch, not build output, and are excluded from `inside` —
the same partition the previous increment's report used.

## How the baseline was obtained (orchestration — ADVISORY, see the two-clocks note)

`git worktree add` was **not** used: this agent is worktree-isolated and the guard refuses a git
operation it cannot verify stays inside the worktree. Instead the baseline is an **APFS clone of the
working tree** with the two changed files restored from `HEAD` (`git show HEAD:<path>`), the untracked
feature directory removed, and `.pharn/writes-scope.json` reset. Confirmed pre-build by content:
`grep -c degit` over the baseline `SECURITY.md` → **3**, the pre-fix count. This is equivalent to a
detached baseline checkout for gate purposes and is non-destructive; **the substitution is
orchestration and is advisory** — the verdict below still rests only on the captured exit codes.

## Per-gate exit codes (the floor input)

Gate set decided once and applied identically to both sides — a mismatch would have made the verdict
`inconclusive`, never a silent pass.

| gate | base | head | flipped? |
| --- | --- | --- | --- |
| `format:check` | 0 | 0 | no |
| `lint` | 0 | 0 | no |
| `lint:md` | 0 | 0 | no |
| `typecheck` | 0 | 0 | no |
| `test` | 0 | 0 | no |
| `validate` | 0 | 0 | no |

The style gates were run **even though the deterministic skip rule permits skipping them** (`inside`
touches no shared style config — not `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, or
`.markdownlint-cli2.jsonc`). Running them is strictly wider than the minimum and never weakens the
comparison; `lint:md` in particular is the gate that actually reads `SECURITY.md`, so having it green
on both sides is worth the seconds it cost.

- `regressions[]`: **none**
- `pre_existing[]`: **none**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`check-regress.mjs verdict` → `"no-regressions"`, exit **0**.)

**The honest residual (P7):** this catches **exactly what the suite catches — nothing more.** The
verdict certifies the **comparison**, not the increment. Two specific things it cannot see here, both
inherent rather than newly introduced: no deterministic gate reads `SECURITY.md`'s **prose** (`lint:md`
checks markdown syntax; `format:check` never opens a `.md`; no `vitest` test reads the file), so the
correctness of the rewritten security claims is **not** covered by any gate on either side — it rests
on the line-by-line source citation recorded in `PLAN.md` and re-checked at review. And `CHANGELOG.md`
is in `.markdownlint-cli2.jsonc`'s `ignores`, so nothing lints it at all. Neither is a regression;
both are the reason this stage's green is narrower than it looks.
