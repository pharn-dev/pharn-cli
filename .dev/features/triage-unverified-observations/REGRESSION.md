# REGRESSION — triage-unverified-observations

Baseline = merge-base with `origin/main`, measured in a detached worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`**. +3 tests (the archetype-walk bounds). Everything
else in this branch is prose.
