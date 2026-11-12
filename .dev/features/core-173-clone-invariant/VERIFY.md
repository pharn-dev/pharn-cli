# VERIFY — core-173-clone-invariant

All gates were run at HEAD in the worktree (`8fe3d5a` plus the uncommitted build), over the whole repo. The gate set is the six CI gates plus `test:coverage` and `validate`, the same set core-171 used.

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

Not covered by these gates: `THREAT-MODEL.md` has not been changed yet. It is hook-protected, and the patch script is for the human to run. Its post-patch text was dry-run against a copy, where all 10 replacements applied and markdownlint was clean. A run of `npm run lint:md` after the human applies it is still owed.

Verified means the named gates passed. It is not a guarantee of correctness beyond what those gates check. Verifier concerns would be advisory help, not assurance.
