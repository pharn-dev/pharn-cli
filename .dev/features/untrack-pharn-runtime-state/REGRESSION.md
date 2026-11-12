# REGRESSION — untrack-pharn-runtime-state

The verdict below is computed by `.dev/floor/check-regress.mjs`, not by this stage's judgment.

## Base and partition

- **base:** `f83b736a98867eed28c12f6d164189627e4be0e1` (`HEAD`; the build is an uncommitted working
  tree on top of it, so `git status --porcelain` is non-empty → `base = HEAD`).
- **inside:** the 9 paths `git diff --name-only HEAD` reports (`.gitignore` plus the eight index
  removals under `.pharn/`) and the untracked `tests/repo-runtime-state.test.ts` — each declared in
  `PLAN.md` `## Files`. This feature's own stage artifacts (`.dev/features/untrack-pharn-runtime-state/*`)
  are not build output and were left out of `--changed`, as in the supervise-stage run. A first
  `scope` call that included them exited 1 naming exactly those two files (`PLAN.md`, `GRILL.md`);
  the call without them exited **0**, `escaped: []`.
- **outside gates:** the 46 stdlib `*.test.mjs` / `*.test.cjs` files `scope` returned (3 hook tests +
  43 `.dev/floor/*.test.mjs`, the same 43 in both trees) + whole-repo `validate`; 0 committed eval pairs.
- **style-gate skip:** `inside` touches no shared style config, so `lint` / `format:check` /
  `lint:md` are absent from both maps.
- **environment:** this session is isolated in its worktree and refuses `git worktree add` on another
  path, so the base ran in a `git archive` export of the base SHA extracted into the session
  scratchpad (the same tracked tree, no `.git`; the core gates are stdlib-only and need neither). Both
  sides ran the same commands with the proxy variables unset; each `node --test` run reported 756 tests.

## Gates

| gate       | base | head |
| ---------- | ---- | ---- |
| `tests`    | 0    | 0    |
| `validate` | 0    | 0    |

## Verdict

`check-regress.mjs verdict` exited **0**: `"verdict": "no-regressions"`, `regressions: []`,
`pre_existing: []`. Machine copy: `regression-report.json` (verbatim helper output).

Limit (stated, not hidden): the outside set is the stdlib suites plus `validate`; the vitest suite
(`tests/**`) is inside the feature by path and is gated by `/pharn-dev-build`'s `npm run check` and
`/pharn-dev-verify`, not here.
