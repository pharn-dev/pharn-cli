# VERIFY — records-stamp-message

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | command                       | exit |
| -------------- | ----------------------------- | ---- |
| `test`         | `npm test` (vitest, 1127)     | 0    |
| `validate`     | `node .dev/floor/validate.mjs .` | 0    |
| `lint`         | `npm run lint`                | 0    |
| `format:check` | `npm run format:check`        | 0    |
| `lint:md`      | `npm run lint:md`             | 0    |
| `typecheck`    | `npm run typecheck`           | 0    |

`structural:*` gates: **none** — this increment ships no committed eval expected↔actual pair, so no
such gate is in the map (the same handling `/pharn-dev-regress` gives an empty pair set).

VERIFIED: floor gates PASS (`check-verify.mjs` → `"verdict": "PASS"`, `failing_gates: []`, exit 0).

The feature-specific correctness signal inside `test` is `tests/install-records.test.ts`, which now
pins all three mismatch shapes (skillsVersion-only, commit-only, both), the null-commit and
empty-string renderings, and the cost clause. One of those assertions is a **compile-time** pin
rather than a runtime one: the expected label is bound through `import type { UpdateLabel }` from
`src/lib/update-decision.js`, so renaming that label reds the `typecheck` gate above rather than
silently leaving the message naming a bucket that no longer exists.

## A flake observed and run to ground (orchestration note — advisory)

The **first** `npm test` capture exited **1**: `tests/lint-gate.test.ts` failed two cases with
`Test timed out in 5000ms`, and the run took 29.5s against the 6.6s the same suite took minutes
earlier at the build stage. Both failures are timeouts, not assertions, in a file that spawns
`eslint` subprocesses — wall-clock-sensitive by construction, and untouched by this increment.

It was not accepted on that reasoning. Re-running the file with `--testTimeout=120000` passed
**7/7**, which isolates "slow" from "wrong", and the subsequent full `npm test` exited **0** — the
value recorded above. The machine was demonstrably loaded by concurrent work at the time (a shared
scratchpad file was observed being overwritten by another agent mid-run). Recorded here rather than
quietly re-run: a green captured after a red should always be visible in the artifact.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.
**No verifiers registered — floor gates only.** No verifier free-text exists in this run, so nothing
untrusted was appended after the verdict.

## Residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance. Specifically un-guaranteed here: that the
new message is *clearer* to a human. The gates pin what it contains, never that it reads well.
