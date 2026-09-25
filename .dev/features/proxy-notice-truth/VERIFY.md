# VERIFY — proxy-notice-truth

## FLOOR layer (owns the verdict)

The gates ran over the whole repo with the feature present, on node 22, with the session proxy
variables unset. They ran as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` /
`CAP_FOWNER` (`setpriv`), the CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

- `test` is vitest (1554 tests). It collects this increment's own `tests/proxy-env.test.ts` (one
  case per measured row) and `tests/proxy-env-format.test.ts`. 21 of their cases failed against the
  base code.
- `test:floor` is floor.yml's `node --test` run (754 tests).
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

Outside the verdict, the hermetic setup (grill finding 3) was checked by running the WHOLE vitest
suite under the environments that used to break it:

| extra environment                                | base (worktree, same tree as `f1e8b92`) | head     |
| ------------------------------------------------ | --------------------------------------- | -------- |
| `NODE_USE_ENV_PROXY=1`                           | **15 failed** / 1530                    | 0 / 1554 |
| `HTTPS_PROXY=http://proxy.internal:3128`         | **1 failed** / 1530                     | 0 / 1554 |
| `NODE_OPTIONS=--use-env-proxy` + `HTTPS_PROXY=…` | —                                       | 0 / 1554 |

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

The rule table is exactly as good as its measurements:

- It covers nine Node versions on Linux.
- A future release line is classified by the runtime's own flag list, not by the table.
- The win32 case-insensitivity comes from `process.env` and was not measured here.
- `NO_PROXY` is still only hedged in the "on" message, never evaluated (GATE 1 answer 2).
