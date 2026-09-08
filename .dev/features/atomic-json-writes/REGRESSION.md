# REGRESSION — atomic-json-writes

- base: `391c9a67e95cabd9648e46a5a27d8248714f58d8` (`origin/main`, the branch's fork point; the
  working tree is dirty, and `base = HEAD` resolves to the same commit here since the increment is
  uncommitted)
- machine report: `.dev/features/atomic-json-writes/regression-report.json`

## The exact partition

Full change set (`git diff --name-only` + untracked-new, minus the gitignored `prompts/`): the eight
paths of the plan's `## Files`, plus `.pharn/writes-scope.json` (every stage's Step 0 setter),
`.dev/features/atomic-json-writes/PLAN.md` (`/pharn-dev-plan`) and `GRILL.md` (`/pharn-dev-grill`).

The **build-only** subset is byte-identical to the plan's `## Files` and is what was passed as
`--inside`.

## The fix #7 scope check

Given the FULL diff, `check-regress.mjs scope` exited **1**, flagging the three sibling-stage
artifacts — the same known `base = HEAD` interaction recorded for the previous two increments, not a
build escape. Re-run over the eight product files only: exit **0**, `escaped: []`. Both runs
recorded.

## Gate set and results

Style gates skipped by the deterministic config-touch rule (`inside` touches no shared style config).
Both captures ran under `setopt SH_WORD_SPLIT` — zsh does not word-split an unquoted variable, and
without it `node --test` receives the whole file list as ONE argument and answers "Could not find",
identically on both sides (the failure mode recorded on the previous increment).

| gate       | command                                            | base | head |
| ---------- | -------------------------------------------------- | ---- | ---- |
| `tests`    | `node --test <46 outside *.test.mjs / *.test.cjs>` | 0    | 0    |
| `validate` | `node .dev/floor/validate.mjs .`                    | 0    | 0    |

## Verdict (FLOOR — `check-regress.mjs`, exit 0)

```json
{ "regressions": [], "pre_existing": [], "verdict": "no-regressions" }
```
