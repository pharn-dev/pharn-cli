# VERIFY — markdown-it-15-0-3

Gates run at HEAD (working tree with the increment), whole-repo:

| gate         | exit |
| ------------ | ---- |
| test         | 0    |
| validate     | 0    |
| lint         | 0    |
| format:check | 0    |
| lint:md      | 0    |
| typecheck    | 0    |

No committed eval pair ships with this increment, so there is no `structural:*` gate. The feature's own
check is the new `markdown-it floor` block in `tests/dependency-overrides.test.ts`, collected by `npm test`
(shown RED against the 15.0.1 lockfile during the build, GREEN after the bump).

**VERIFIED: floor gates PASS** (`check-verify.mjs` exit 0, `failing_gates: []`).

Verifiers: no verifiers registered — floor gates only (`count-verifiers.mjs` → `registered: 0`).

Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance.
