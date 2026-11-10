# VERIFY — prettierignore

Floor layer (owns the verdict; `check-verify.mjs`, PASS iff every gate exits 0), run at the working tree with the feature in it:

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

No `structural:*` gate: the feature ships no eval-actual pair (a TypeScript increment; its correctness signal is its own vitest files — `tests/prettierignore.test.ts`, `tests/ignore-file.test.ts` and the wiring cases — collected by `npm test`).

Advisory layer: no verifiers registered — floor gates only (`count-verifiers.mjs` → `{"registered":0}`).

**VERDICT: PASS** (`check-verify.mjs`, exit 0). This says the deterministic suite is green with the increment in it — exactly as good as that suite, not a judgment that the feature is correct or wise.
