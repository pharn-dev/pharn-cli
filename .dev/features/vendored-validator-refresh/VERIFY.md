# VERIFY — vendored-validator-refresh

The verdict below is computed by `.dev/floor/check-verify.mjs` from gate exit codes, not by this
stage's judgment.

## FLOOR layer — the deterministic gates (own the verdict)

Run at HEAD (the working tree with the feature in it), whole-repo:

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

No `structural:*` gate: the feature ships no committed eval pair. The feature's own correctness signal
is its vitest coverage in `tests/capability-index.test.ts`, collected by `test`: the differential
fence rows (BOM, CRLF, displaced leads) and value rows against the sha256-pinned vendored validator,
the displaced-reason skip cases, and the run of the vendored validator with its two imports.

**VERDICT: PASS** (`check-verify.mjs` exit 0, `failing_gates: []`).

## ADVISORY layer — verifiers (annotate, never gate)

`count-verifiers.mjs` → `{"registered":0}`: no verifiers registered — floor gates only.

## Residual

"Verified" means the six named gates passed, nothing more. A defect no test, rule or lint covers is
invisible to this verdict.
