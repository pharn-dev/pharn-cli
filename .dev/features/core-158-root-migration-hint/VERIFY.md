# VERIFY — core-158-root-migration-hint

All gates were run at HEAD in the worktree (`991b229` plus the uncommitted build), over the whole repo, with
`CI=1` (picocolors on, as in CI). The gate set is the six CI gates plus `test:coverage` and `validate`, the
same set core-171 and core-173 used.

| gate          | exit |
| ------------- | ---- |
| build         | 0    |
| format:check  | 0    |
| lint          | 0    |
| lint:md       | 0    |
| test          | 0    |
| test:coverage | 0    |
| typecheck     | 0    |
| validate      | 0    |

No committed eval pair ships with this feature, so there is no `structural:*` gate.

**VERIFIED: floor gates PASS** (`check-verify.mjs`, verbatim: `"verdict": "PASS"`, `failing_gates: []`).

Verifiers: no verifiers registered (`count-verifiers.mjs` → `{"registered":0}`), so these are floor gates only.

Not covered by these gates: the vendored `.agents/skills/pharn-cli/` skill still describes the moves. It is
owned by pharn-dev/skills and left untouched by decision at GATE 1; its stale lines go to a follow-up.

Verified means the named gates passed. It is not a guarantee of correctness beyond what those gates check.
Verifier concerns would be advisory help, not assurance.
