# REGRESSION — contributing-six-gates

Baseline `977aa3805bdf57c24da299955c55370a84331d58`, measured in a detached worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`**. 1056 → 1061 tests (five new `check` pins).

Note the one thing this table cannot show: `npm run check` itself is now a *different* command. It was
re-run at head both clean (0) and against a deliberately broken `docs/troubleshooting.md` heading (1),
which is the behavior change the increment exists for.
