# REGRESSION — remove-yes-contract

Baseline `977aa3805bdf57c24da299955c55370a84331d58` (merge-base with `origin/main`), measured in a
detached worktree. Head = this branch.

| gate | base | head |
| --- | --- | --- |
| `test` | 0 | 0 |
| `lint` | 0 | 0 |
| `typecheck` | 0 | 0 |
| `format:check` | 0 | 0 |
| `lint:md` | 0 | 0 |
| `validate.mjs` | 0 | 0 |

`check-regress.mjs verdict` → **`no-regressions`** (`regressions: []`, `pre_existing: []`). Test count
moved 1056 → 1059 (three new pins: the signature check plus the two per-path confirm pins); five
existing dispatch assertions changed shape, none were deleted.

## Environment note (measured, not hand-waved)

The **first** base measurement (20:24) and the first head run disagreed for a reason that had nothing
to do with this change: between them, the `node_modules` shared by every worktree here lost `degit` —
a declared runtime dependency (`package.json` `dependencies.degit: 3.6.6`) — so
`tests/proxy-env.test.ts` went red at head with
`ENOENT: … scandir 'node_modules/degit/dist/'` on five cases that read the installed package. Restored
with `npm install --no-save degit@3.6.6` (a dry run first confirmed **`add degit 3.6.6` / added 1
package** and no removals), then **both** base and head were re-measured under the restored tree. The
table above is the re-measurement; base and head share one environment, which is the only way the
comparison means anything.
