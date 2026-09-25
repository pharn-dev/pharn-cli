# VERIFY — init-preflight-first

## FLOOR layer (owns the verdict)

The gates ran over the whole repo with the feature present, with the session proxy variables unset,
as root **without** `CAP_DAC_OVERRIDE` / `CAP_DAC_READ_SEARCH` / `CAP_FOWNER` (`setpriv`), the
CI-equivalent of this root sandbox.

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `test:floor`   | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

- `test` is vitest (1666 tests). Before any source change, the three new cases were run against the
  unchanged code, and each failed:
  - the whole-`runInit` case, because the overwrite warning was shown before the refusal;
  - the call-order case, because no pre-flight was called before the prompt;
  - the refusal case, because `init` never called the pre-flight and so did not exit.
- `npm run test:coverage` passes its ratchet (97.52 / 92.89 / 98.34 / 98.36) and `npm run build`
  exits 0; neither is a verdict gate, both are CI gates.
- `test:floor` is floor.yml's `node --test` run (754 tests).
- There is no `structural:*` gate: the increment ships no eval-actual pair.

**VERDICT: PASS** (`.dev/floor/check-verify.mjs`, `failing_gates: []`).

## ADVISORY layer

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. No verifiers are
registered, so the verdict rests on the floor gates only.

Residual (P0/P7): verified = the named gates passed; this is NOT a guarantee of correctness beyond
what those gates check — verifier concerns are advisory help, not assurance.

Named limits:

- The early pre-flight is an early answer only. The tree can change while the prompt is open, so
  the checks under the lock (before the backup) and in `installCapabilities` (before the copy)
  stay the authoritative ones. Their own cases are unchanged and still pass.
- The summary prompt (install / cancel) still comes before the refusal. A cancelled summary builds
  no manifest and runs no pre-flight, and a test pins that.
