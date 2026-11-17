# VERIFY — c83-remove-derivation-fallback

| gate | exit |
| --- | --- |
| test (vitest, whole repo) | 0 |
| validate | 0 |
| lint | 0 |
| format:check | 0 |
| lint:md | 0 |
| typecheck | 0 |
| build | 0 |

VERIFIED: floor gates PASS (`check-verify.mjs`, exit 0, `failing_gates: []`).

Verifiers: none registered, so this is floor gates only (`count-verifiers.mjs` → `{"registered":0,"verifiers":[]}`).

The feature ships no committed eval-actual pair, so there is no `structural:*` gate. Its own tests run inside `test`: the refusal at `fetchRepo`, at `readUpstreamManifest` and in each command suite, and old flat / pre-7.0 installs updating to the latest release.

Verified = the named gates passed. This is NOT a guarantee of correctness beyond what those gates check; verifier concerns are advisory help, not assurance.
