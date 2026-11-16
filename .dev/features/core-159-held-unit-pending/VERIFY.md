# VERIFY — core-159-held-unit-pending

All gates were run at HEAD (`79abf0d`) in the worktree, over the whole repo, with `CI=1` for the test gates (CI turns picocolors on). The gate set is the six CI gates plus `test:coverage` and `validate`, the same set core-173 used.

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

Not covered by these gates: the pharn-ci diff-coverage and test-integrity checks run only on the PR. The three inverted assertions are named in the PR body for its reviewer.

Verified means the named gates passed. It is not a guarantee of correctness beyond what those gates check. Verifier concerns would be advisory help, not assurance.
