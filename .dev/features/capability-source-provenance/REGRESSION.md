# REGRESSION — capability-source-provenance

**Base:** `9919277` (working-tree dogfood build → `base = HEAD`, per the deterministic base rule:
`git status --porcelain` was non-empty).

## Partition

`inside` = 24 paths, **exactly** the plan's `## Files` — `check-regress.mjs scope` exits **0** with
**zero** fix-#7 findings, so the build did not escape its declared writes.

- `inside` (24): the 9 source files, 8 test files, 7 docs the plan named.
- `outside_tests` (44 files / **665 tests**): every `*.test.mjs` / `*.test.cjs` in the repo — the
  `.claude/hooks/*` and `.dev/floor/*` suites.
- `outside_eval_pairs`: none (no committed eval pair sits outside this feature).
- **Style gates SKIPPED** by the deterministic config-touch rule: `inside` touches no shared style
  config (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.markdownlint-cli2.jsonc`), so a
  style flip over byte-identical outside files is provably impossible. Skipped on **both** sides.

### Two orchestration corrections, recorded rather than hidden

Both are **advisory orchestration** (how the scope and the runs were set up). Neither touches the
verdict, which is the helper's exit-code comparison.

1. **Pipeline artifacts excluded from `--changed`.** The first `scope` run passed the whole dirty
   working tree and exited **1** with three blocking fix-#7 findings:
   `.dev/features/capability-source-provenance/PLAN.md`, `…/GRILL.md`, and `.pharn/writes-scope.json`.
   None is a build escape — `PLAN.md` was written by `/pharn-dev-plan` and `GRILL.md` by
   `/pharn-dev-grill`, each under **its own** Step-0 scope, and `.pharn/**` is declared
   always-writable scratch by `enforce-writes-scope.cjs`. Re-run over the build-attributable set:
   exit **0**, zero findings. Both runs are reported here; the first is a false positive of feeding
   `scope` the whole tree, not a scope breach.
2. **A vacuous `tests` gate, caught and fixed.** The first capture passed all 44 test paths to
   `node --test` as a **single** argument (`Could not find '<all 44 joined>'`), scoring `tests=1` on
   both sides. That would have compared 1→1 and still read "no regressions" while measuring
   **nothing**. Re-run with correct argv splitting: 665 tests execute, 665 pass, both sides.

## Per-gate exit codes

| Gate       | base (`9919277`) | head | Flip                         |
| ---------- | ---------------- | ---- | ---------------------------- |
| `tests`    | 0                | 0    | none (665 pass / 0 fail × 2) |
| `validate` | 0                | 0    | none                         |

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

**Both sides were measured in clean `git worktree` checkouts** (base at `9919277`; head = that plus
this increment applied), so the gate set and the tree shape are identical. This matters for
`validate`: in the **local working directory** it exits 1, but all 15 findings sit inside the
gitignored `test-*/` fixture apps (`test-backend/`, `test-edge/`, `test-edge2/`, `test-full/`,
`test-lib/`, `test-next/`, `test-spa/`) — **zero** outside them. Those directories are untracked local
scratch, absent from both worktrees, and `validate` is GREEN at the base commit in a clean tree.
Measuring one side dirty and one side clean would have manufactured a false regression.

## Verdict (FLOOR — computed by `.dev/floor/check-regress.mjs verdict`, exit 0)

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

The verdict is a comparison of captured exit codes, not a judgment: no gate flipped pass→fail. What
is **advisory** here is everything around it — choosing the base, partitioning inside/outside, and
running the suite (including the two corrections above).

**Honest residual (P0/P7):** `/pharn-dev-regress` catches **exactly what its suite catches — nothing
more.** The claim is "deterministically-detectable breakage outside the feature is caught," **not**
"nothing broke." A regression no deterministic check covers is invisible to this stage. In
particular, the 665 outside tests cover `.claude/hooks/*` and `.dev/floor/*` — they do **not** exercise
the `src/` CLI, whose coverage lives in the vitest suite that this feature's own `inside` scope owns
(reported by `/pharn-dev-verify`, and GREEN at 592 tests). This is **not** a certification that the
increment is correct or wise — only that nothing outside it deterministically broke.
