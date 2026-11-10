# REGRESSION — update-executable-unit

- base: `78c7a13870a497255e1600430755210f1706b58b` (HEAD; working-tree build, `git status --porcelain` non-empty)
- inside: the 22 changed/new paths listed in `regression-report.json` `.inside`. All of them are in the plan's `## Files` or the feature folder (`scope` reported `escaped: []`). Left out of the inside set as scratch or files older than this build: `.pharn/writes-scope.json` (hook scratch) and the untracked `pharn/.backup/20261104-131454/` (a backup dated 2026-11-04, before this session).
- outside gates: 46 node tests (`*.test.mjs` / `*.test.cjs`, none inside) + whole-repo `validate`. No committed eval pairs. Style gates skipped: the inside set touches no shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.markdownlint-cli2.jsonc`).

| gate       | base | head |
| ---------- | ---- | ---- |
| `tests`    | 0    | 0    |
| `validate` | 0    | 0    |

- regressions: `[]`
- pre_existing: `[]`

Run note: the first capture recorded `tests: 1` on both sides. zsh had passed the space-joined test list to `node --test` as one argument (unquoted `$VAR` does not split in zsh). Re-captured on both sides with `${=TESTS}`; the table above is the re-capture. The vitest suite (`npm run check`, 3485 passed) is the build's floor, not an outside gate here.

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.**

Residual: this comparison catches exactly what its suite catches, nothing more. A breakage that no deterministic check covers is invisible to it.
