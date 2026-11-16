# VERIFY — core-184-parseargs

- machine report: `.dev/features/core-184-parseargs/verify-report.json` (`check-verify.mjs` stdout verbatim, plus the
  empty `verifiers` block)
- run at HEAD = the working tree with the feature in it (iteration 2, after the `list.md` / `status.md` doc fix)

## Floor gates

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

`npm test`: 99 files, 3,405 passed, 1 skipped (the pre-existing skip). No committed eval pairs, so no
`structural:*` gate.

VERIFIED: floor gates PASS.

## Verifiers (advisory)

no verifiers registered — floor gates only (`count-verifiers.mjs` → `{"registered":0,"verifiers":[]}`).

verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier
concerns are advisory help, not assurance.
