# VERIFY — fresh-init-hooks

Floor gates, run once at HEAD (working tree with the feature in it):

| Gate           | Exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

No committed eval pair → no `structural:*` gate. Verifiers: no verifiers registered — floor gates only
(`count-verifiers.mjs` → `{"registered":0}`).

**VERDICT: PASS** (`check-verify.mjs`, every gate exit 0; `failing_gates: []`).

This means the named gates passed — nothing more. It does not certify that the feature is correct beyond
what those gates (including the feature's own vitest cases) encode.
