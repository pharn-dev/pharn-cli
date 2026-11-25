# REGRESSION — core-387-verify-archive

- Base: `f9fa96b0ac`, which is origin/main after #448 (CORE-386) merged. Its tree is identical to the 386 branch tip
  `ab300d9b`. The baseline ran there in a detached worktree. The branch was cut from 386 and then merged forward
  to main (no rebase).
- Inside: the 26 paths in `regression-report.json`. `check-regress.mjs scope` reported `escaped` empty, so nothing
  escaped the plan's declared files. `tests/release-consistency.test.ts` was declared in the plan when the 386
  branch merged in.
- Outside gates:
  - the 53 stdlib `*.test.mjs` / `*.test.cjs` files, run with `node --test`;
  - `node .dev/floor/validate.mjs .`;
  - the full vitest suite (through heavy.sh, `--maxWorkers=2`; at HEAD with `--coverage` and `CI=1`).

| Gate     | base | head |
| -------- | ---- | ---- |
| tests    | 1    | 1    |
| validate | 0    | 0    |
| vitest   | 0    | 0    |

`regressions[]`: none.

`pre_existing[]`: `tests`. It is red at the base too, from `.codex/hooks/set-writes-scope.test.cjs`, which this
change does not touch.

At HEAD, vitest ran 3,722 tests (1 skipped) against 3,680 at the base. Coverage: 98.59 / 95.77 / 99.08 / 99.07
(statements / branches / functions / lines). The new and changed source files are fully covered.

REGRESSIONS: none, meaning no breakage outside the feature that these gates can detect (verdict `no-regressions`,
from `check-regress.mjs`). This certifies only the base→head comparison of these gates.
