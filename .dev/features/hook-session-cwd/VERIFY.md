# VERIFY — hook-session-cwd

Machine report: `.dev/features/hook-session-cwd/verify-report.json` (`check-verify.mjs`, verbatim, plus the
advisory `verifiers` block).

## Floor gates (whole repo, at HEAD with the feature present)

| gate            | exit |
| --------------- | ---- |
| test            | 0    |
| validate        | 0    |
| lint            | 0    |
| format:check    | 0    |
| lint:md         | 0    |
| typecheck       | 0    |
| floor:node-test | 0    |

`floor:node-test` is the existing `floor` workflow's unit-test step
(`node --test "**/*.test.mjs" "**/*.test.cjs" ".claude/**/*.test.cjs" …`, `.github/workflows/floor.yml`),
added to the map because this increment's own tests are `.claude/hooks/*.test.cjs`, which `npm test`
(vitest, `tests/**/*.test.ts`) never collects. No committed eval pair → no `structural:*` gate.

## Verdict

VERDICT: PASS — every floor gate exit 0 (`failing_gates: []`).

## Verifiers (advisory)

No verifiers registered — floor gates only (`count-verifiers.mjs` → `{"registered":0}`).

The verdict is as good as the deterministic suite it runs: it says these gates exit 0 with the change
present, not that the change is correct or wise.
