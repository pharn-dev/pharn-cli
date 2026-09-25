# REGRESSION — release-0-7-0

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `9bd4e3052e4a998dfa8b5815801219fd4df5561d` (`HEAD` = `origin/main` after #231; the build is
  an uncommitted working tree on top of it).
- **inside:** `CHANGELOG.md`, `package-lock.json`, `package.json` — each declared in `PLAN.md`
  `## Files`. `scope` exited **0**, `escaped: []`.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files (754 tests) + whole-repo
  `validate`; 0 committed eval pairs. No shared style config touched, so the style gates are skipped
  on both sides. The base ran in a fresh detached worktree; proxy variables unset on both sides.

## Per-gate exit codes

| gate       | base | head | flipped? |
| ---------- | ---- | ---- | -------- |
| `tests`    | 0    | 0    | no       |
| `validate` | 0    | 0    | no       |

- `regressions[]`: **empty**
- `pre_existing[]`: **empty**

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**
(`regression-report.json` `.verdict` = `no-regressions`.)

Residual (P0/P7): this catches exactly what its suite catches, nothing more.
