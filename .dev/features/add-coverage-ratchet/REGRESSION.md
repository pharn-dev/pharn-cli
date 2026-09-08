# REGRESSION — add-coverage-ratchet

Baseline `8898ecfec259fe5995270b8362daa4d90512b818` (the FINAL tree — every prompt in the bundle merged), measured in a detached
worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`**. +5 tests.

The gate this increment actually changes is **`test:coverage`**, which CI runs and `npm run check`
does not — so the six-gate table above cannot see it. Re-run at head against the NEW floors:
**exit 0**, 97.06 / 92.48 / 97.55 / 97.92 against 97 / 92 / 97 / 97.
