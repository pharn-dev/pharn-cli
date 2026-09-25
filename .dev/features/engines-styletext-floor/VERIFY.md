# VERIFY — engines-styletext-floor

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

- `test` is vitest (1513 tests). It collects this increment's own tests: `tests/engines.test.ts`,
  whose code-floor case fails on the base `>=20.12.0`.
- `test:floor` is floor.yml's `node --test` run (754 tests).
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

Outside the verdict, the packed CLI was driven in a 120×40 pty through `pharn remove`'s picker on
the official binaries. Each cell shows the exit code and what printed:

| keys                           | Node 20.12.0                   | Node 20.13.0   |
| ------------------------------ | ------------------------------ | -------------- |
| Ctrl-C at the picker           | 0, "Cancelled"                 | 0, "Cancelled" |
| Space, Ctrl-C (a selection)    | **1, `ERR_INVALID_ARG_VALUE`** | 0, "Cancelled" |
| Space, Enter, Ctrl-C (confirm) | **1, `ERR_INVALID_ARG_VALUE`** | 0, "Cancelled" |

`--version` runs on both, which is why the smoke job alone could never catch this.

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

The code scan sees only the API usages its table names, called by their literal name. The
non-required smoke job is the only runtime check at the floor, and it does not drive a prompt.
