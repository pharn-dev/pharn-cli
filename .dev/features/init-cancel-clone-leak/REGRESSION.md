# REGRESSION — init-cancel-clone-leak

Baseline `7d96bbca2186d835b539e09abb3beaac470291d3`, measured in a detached worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`**. Test count unchanged at 1071: two cases added
(the CANCEL lifecycle case and the three-way exit guard), two removed with `confirmWarning`.
