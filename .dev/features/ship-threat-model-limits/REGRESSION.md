# REGRESSION — ship-threat-model-limits

- base: `bda050dcaaaa0b0e447fa9db50dbd27f372cdeba` (`origin/main`)
- machine report: `.dev/features/ship-threat-model-limits/regression-report.json`

## The exact partition

Full change set: the seven paths of the plan's `## Files`, plus `.pharn/writes-scope.json` and the
two sibling-stage artifacts (`PLAN.md`, `GRILL.md`). The build-only subset is byte-identical to the
plan's `## Files` and is what was passed as `--inside`.

## The fix #7 scope check

Full diff → `scope` exit **1** on the three stage artifacts (the known `base = HEAD` interaction, not
a build escape). Build-only subset → exit **0**, `escaped: []`. Both recorded.

## Gate set and results

Style gates skipped by the config-touch rule. Both captures ran under `setopt SH_WORD_SPLIT`.

| gate       | base | head |
| ---------- | ---- | ---- |
| `tests`    | 0    | 0    |
| `validate` | 0    | 0    |

## Verdict (FLOOR — exit 0)

`no-regressions` — no outside gate flipped pass→fail.
