# VERIFY — signal-lock-release

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

- `test` is vitest (1530 tests). It collects this increment's own tests: `tests/fatal-signal.test.ts`,
  the child-process and in-process cases in `tests/project-lock.test.ts`, and the observable-cancel
  cases in `tests/repo.test.ts`. 14 of them fail when run against the base `src/` (checked in a
  worktree of `cf6582e`).
- `test:floor` is floor.yml's `node --test` run (754 tests).
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

Outside the verdict, the review's reproduction was re-run on this build. A process holds the lock,
runs `fetchRepo`, and signals itself:

| signal  | base: exit / lock left | head: exit / lock left |
| ------- | ---------------------- | ---------------------- |
| SIGTERM | 143 / yes              | 143 / no               |
| SIGINT  | 130 / yes              | 130 / no               |

SIGHUP is deliberately not handled (the plan's amendment, decided by the human). Measured on Node
22: a `process.on('SIGHUP')` listener ran even under `trap '' HUP`, the `SIG_IGN` that `nohup`
sets. A test pins that pharn adds no SIGHUP listener.

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

What the gates do not reach:

- SIGKILL, power loss and a hangup (SIGHUP) still strand the lock. The same host reclaims it by
  the dead-pid check; another host waits out `STALE_MS`.
- A signal before `withProjectLock` registers keeps Node's default disposition, as before.
- The defensive fallback (`exit(128 + n)` when the re-raise throws) is proven with a stub only. CI
  runs no Windows.
