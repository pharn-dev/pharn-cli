# VERIFY — publish-pack-destination

## FLOOR layer (owns the verdict)

Gates run over the whole repo with the feature present, on node 22 with the session proxy variables unset
and as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` / `CAP_FOWNER` (`setpriv`) — the
CI-equivalent of this root sandbox (as plain root, 4 pre-existing chmod-based tests in `update.test.ts` fail
for environmental reasons, identically at the baseline).

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

`test:floor` is floor.yml's existing `node --test` over the `*.test.mjs` / `*.test.cjs` globs (754 tests). It is
in the map because this increment's own test lives in `.dev/floor/check-run-pins.test.mjs`, which `npm test`
(vitest, `tests/**/*.test.ts`) never collects — without it the feature's own spec would not reach the verdict.
`test` is vitest (1472 tests). No `structural:*` gate — the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — no verifiers registered, floor
gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond what those
gates check — verifier concerns are advisory help, not assurance. In particular, no gate here runs
`publish.yml` itself: the first real Release run remains the end-to-end test of the workflow (PLAN.md's
guarantee audit).
