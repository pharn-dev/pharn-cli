# VERIFY — core-192-claude-md-trim

- machine report: `.dev/features/core-192-claude-md-trim/verify-report.json` (`check-verify.mjs` output, verbatim, plus
  the advisory `verifiers` block)
- every gate ran at HEAD in this worktree. The test gate ran with `CI=1`, as CI runs it, with 2 workers.

## Floor gates

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

The test gate covered 109 files: 3,778 tests passed and 1 was skipped. The feature ships no committed eval pair, so
there is no `structural:*` gate.

VERIFIED: floor gates PASS.

The feature's own claims, checked outside the gate map (supporting evidence, not part of the verdict):

- Token equivalence against origin/main: `OK 88 files token-identical to origin/main`, with directive-comment counts
  at 0 on both sides.
- `npx --yes cloc src`: comment lines went from 8,530 to 4,973, with code unchanged at 13,459. That is 37.0%, against a
  target of at most 50%.
- `CLAUDE.md`: 149 lines, longest line 131 characters. `docs/architecture.md`: 220 lines.
- `npm run build`: exit 0.

## Verifiers

No verifiers are registered (`count-verifiers.mjs` reports `registered: 0`), so only the floor gates count.

Verified means the named gates passed. It is not a guarantee of correctness beyond what those gates check. In
particular, whether a shortened comment or `docs/architecture.md` still says exactly what the code does is a matter
for human review, and verifier concerns are advisory help, not assurance.
