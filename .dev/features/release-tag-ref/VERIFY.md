# VERIFY — release-tag-ref

- feature: `release-tag-ref` at `55fae47` (`fix/release-tag-ref`), run in the feature worktree (no gitignored `test-*/` trees)
- machine report: `.dev/features/release-tag-ref/verify-report.json` (`check-verify.mjs`, verbatim, plus the advisory `verifiers` block)

## Floor gates

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

`test` ran with `CI=1` (picocolors on, as in the `Test` job). The feature ships no committed eval pair, so there is no `structural:*` gate. The feature's own tests are collected by `npm test`:

- `tests/release.test.ts` (refs/tags URL, never the bare or `tags/` form, one request, 404/422 refusals)
- `tests/repo.test.ts` (refs/heads URL)
- the stub URLs in `tests/repo-signals.test.ts` and `tests/commands-integration.test.ts`

Before the commit, the same four suites were run against the OLD `src/`: 34 tests failed, so the new assertions are not vacuous.

VERIFIED: floor gates PASS.

## Advisory layer

No verifiers registered (`count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`), so the result rests on the floor gates only.

This means the named gates passed, nothing more. That GitHub's `commits/refs/tags/<tag>` resolves only the tag is external behaviour, measured for one annotated tag (v7.10.3) and not covered by any gate.
