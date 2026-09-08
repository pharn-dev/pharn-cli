# REGRESSION — ruleset-contract-pins

Detects breakage OUTSIDE the just-built feature by re-running the deterministic gates at the
pre-build baseline and at HEAD and comparing EXIT CODES. Zero model judgment in the verdict — the
comparison is `.dev/floor/check-regress.mjs verdict`.

## Baseline

- **Base commit:** `5955351bfbfb5f03d6272a4f1b48ae665ed4039f`
  (`docs: name all six CI gates, and make npm run check cover the markdown one (#144)`)
- **Method:** a detached worktree at that commit, with its own installed `node_modules`, measured
  before HEAD was measured. The feature branch is `test/ruleset-contract-pins`.
- **Changed files (`--inside`):** `tests/ci-workflow.test.ts`. Nothing else — no workflow file, no
  `vitest.config.ts`, no source file.

## Gate results

| Gate           | Base | Head | Result |
| -------------- | ---- | ---- | ------ |
| `test`         |    0 |    0 | OK     |
| `lint`         |    0 |    0 | OK     |
| `typecheck`    |    0 |    0 | OK     |
| `format:check` |    0 |    0 | OK     |
| `lint:md`      |    0 |    0 | OK     |
| `validate`     |    0 |    0 | OK     |

- **Verdict:** `no-regressions` (check-regress exit 0)
- **Regressions:** none
- **Pre-existing failures:** none

## Environment note (worth recording, not a regression)

The first HEAD run showed 5 failures in `tests/proxy-env.test.ts`, all
`ENOENT … node_modules/degit/dist/`. Cause: the worktree's `node_modules` was a symlink to a shared
install that has no `degit`. Replacing the symlink with a real `npm ci` in the worktree turned all
1068 tests green, and the baseline worktree was measured with an equivalent install. The failures
were environmental, never reached a measured results file, and are unrelated to the change — but
they are recorded here rather than quietly dropped, because "we re-ran it and it went away" is
exactly the kind of thing a regression report must not hide.

## What this verdict does and does not mean

It means: no gate that passed at the base commit fails at HEAD. It does NOT mean nothing broke —
`/regress` catches exactly what its gates catch, and a breakage no deterministic check covers is
invisible here. For this increment that residual is small: the diff is one test file, and the suite
IS the thing that changed.
