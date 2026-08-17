# REGRESSION — degit-fetch-boundary-truth

**Base:** `45c4be805bd4f708c08c988e5980affe9a1a5376` (`main`, PR #97).
**Head:** `docs/degit-fetch-boundary-truth` (`029375a`, including the human's apply commit).
**Base resolution:** clean `git worktree` checked out at `main` — not the working tree. This matters
here: `validate.mjs` goes RED when gitignored `test-*/` fixture dirs are present, so comparing a
worktree base against a dirty head would have manufactured a flip. No `test-*/` dirs existed this run
(`ls -d test-*/` → no matches), and both sides were measured the same way regardless.

## Partition

**Inside (the changed scope)** — 3 product files + 9 loop artifacts:

```
THREAT-MODEL.md          (applied by the human from THREAT-MODEL.UPDATED.md)
src/lib/repo.ts          (comment lines only)
CHANGELOG.md
.pharn/writes-scope.json
.dev/features/degit-fetch-boundary-truth/{PLAN,FACT-TABLE,GRILL,REGRESSION,VERIFY,REVIEW,SHIP}.md
.dev/features/degit-fetch-boundary-truth/{regression-report,verify-report}.json
```

**Outside:** 46 deterministic test files (`.dev/floor/*.test.mjs`, `.claude/hooks/*.test.cjs`),
0 committed eval pairs.

**Scope check:** `check-regress.mjs scope` → `escaped: []`.

> **First run exited 1**, with two escapes: `THREAT-MODEL.md` and `.pharn/writes-scope.json`.
> Neither is a build escape. `THREAT-MODEL.md` changed because the **human** applied the handoff
> (`mv THREAT-MODEL.UPDATED.md THREAT-MODEL.md`) — the hook's own sanctioned route for a
> `DEFAULT_PROTECTED` file, since `protect-trusted-paths.cjs:58` denies the agent that write
> unconditionally and `PHARN_PROTECTED` composes by addition only. The helper compares changed paths
> against the plan's `## Files` and has no concept of "applied by a human." `.pharn/writes-scope.json`
> is rewritten by every stage's own Step 0 setter. Resolved by **declaring** both in `## Files`,
> exactly as #93 resolved the same class of escape — never by suppressing the check.

## Gate set

Identical at base and head. **Style gates skipped** by the config-touch rule: `inside` touches no
shared style config (`eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`.markdownlint-cli2.jsonc`), so a style flip over byte-identical outside files is impossible.

| Gate | base | head | flip |
| --- | --- | --- | --- |
| `tests` (46 outside files, `node --test`) | 1 | 1 | none — RED on both sides |
| `validate` (`node .dev/floor/validate.mjs .`, whole-repo) | 0 | 0 | none |

## Result

- `regressions[]`: **none**
- `pre_existing[]`: **`tests`** — the outside floor test gate was **already RED at the baseline**,
  before this increment existed. It is therefore **not** a regression. This stage does **not** claim
  it is fine; it claims only that this increment did not cause it. The same pre-existing RED was
  recorded by #93.
- **`verdict: "no-regressions"`**

Machine report: `regression-report.json`.
