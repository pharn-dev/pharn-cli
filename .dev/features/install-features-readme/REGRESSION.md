# REGRESSION — install-features-readme

- base: `d7c8f52c46436ffa7ab9427012130ea3bbe2897f` (`origin/main`) · machine report: `regression-report.json`

Partition: the nine paths of the plan's `## Files` (build-only, byte-identical to `## Files`) plus
the usual three stage artifacts (`.pharn/writes-scope.json`, `PLAN.md`, `GRILL.md`). The build-only
subset was passed as `--inside`; `scope` exited **0**, `escaped: []`.

Style gates skipped by the config-touch rule. Both captures ran under `setopt SH_WORD_SPLIT`.

| gate       | base | head |
| ---------- | ---- | ---- |
| `tests`    | 0    | 0    |
| `validate` | 0    | 0    |

## Verdict (FLOOR — exit 0): `no-regressions`
