# VERIFY — core-167-status-layout-drift

- feature: `core-167-status-layout-drift`, at HEAD = the working tree (the build uncommitted) on base `688a838`.
- Every gate ran with `CI=1` (CI turns picocolors on in tests), through the machine's `heavy.sh` slot lock.

## FLOOR layer (owns the verdict)

| gate            | exit |
| --------------- | ---- |
| `test`          | 0    |
| `validate`      | 0    |
| `lint`          | 0    |
| `format:check`  | 0    |
| `lint:md`       | 0    |
| `typecheck`     | 0    |
| `test:coverage` | 0    |
| `build`         | 0    |

- `npm test`: 109 files, 3670 passed, 1 skipped.
- `test:coverage` ran the same suite under the coverage thresholds and passed. Changed files: `src/lib/status-report.ts` has 100 % lines; `src/commands/status.ts` has 98.81 % lines. Its only uncovered lines (358-359) are the pre-existing `catch` of the drift path, which this change does not touch.
- `build` (esbuild bundle) is included as in core-162, because CI runs it as a required check.
- No committed eval pairs, so there is no `structural:*` gate.

## ADVISORY layer

`count-verifiers.mjs` → `{"registered":0,"verifiers":[]}`: no verifiers registered — floor gates only.

## Verdict

`check-verify.mjs` (verbatim): **PASS**, `failing_gates: []`. This means the named gates passed. It does not mean the feature is correct in any respect those gates do not encode.
