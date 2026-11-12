# VERIFY — pharn-ci-comment-pr-head

Run at HEAD `3199ca6` plus the feature's pipeline notes (working tree), on 2026-11-12.

| gate           | exit |
| -------------- | ---- |
| `test`         | 0    |
| `validate`     | 0    |
| `lint`         | 0    |
| `format:check` | 0    |
| `lint:md`      | 0    |
| `typecheck`    | 0    |

No committed eval pair ships with this feature, so there is no `structural:*` gate.

VERIFIED: floor gates PASS (`check-verify.mjs` exit 0, `failing_gates: []`).

Verifiers: no verifiers registered (`count-verifiers.mjs` → 0), so the verdict rests on the floor gates
only.

Feature-specific signal: `tests/ci-workflow.test.ts` (18 tests, inside `test`). Five deliberate
mutations each turned exactly one of them red during build: the fork clause dropped, a write grant
added to `Test`, a `run:` added to the comment job, an extra pharn-ci input, a shallow comment-job
checkout.

Verified = the named gates passed. This is NOT a guarantee of correctness beyond what those gates
check. In particular, whether GitHub runs the new job as intended and whether its comment matches the
gating report can only be seen on a real pull request (this PR).
