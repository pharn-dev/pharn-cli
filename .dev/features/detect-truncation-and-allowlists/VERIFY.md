# VERIFY — detect-truncation-and-allowlists

Gates ran in a fresh detached worktree of the commit under test (node_modules linked), under the
shared heavy lock, with `CI=1`.

## FLOOR layer (owns the verdict)

| gate         | iteration 1 (`4e239f4`) | iteration 2 (`17ac899`) |
| ------------ | ----------------------- | ----------------------- |
| test         | 1                       | 0                       |
| validate     | 0                       | 0                       |
| lint         | 0                       | 0                       |
| format:check | 0                       | 0                       |
| lint:md      | 0                       | 0                       |
| typecheck    | 0                       | 0                       |

Iteration 1 → `FAIL` (`failing_gates: ["test"]`): one 5 s timeout in `tests/lint-gate.test.ts`
("accepts clean source, so the gate is not simply always-red", which spawns eslint) at a load average of
~24 from parallel agents. That file is outside this increment and passed 7/7 when re-run alone.
Iteration 2 (after a docs-only fix from REVIEW iteration 1) → every gate exit 0.

**Verdict (`check-verify.mjs`, iteration 2): `PASS`.** No structural eval pair is shipped by this
increment, so there is no `structural:*` gate.

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — no verifiers registered,
floor gates only.

Residual: "verified" means exactly that the named gates passed — not that the increment is correct
in any sense the suite does not encode.
