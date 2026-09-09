# VERIFY — ci-smoke-built-bundle

## FLOOR layer — the gates that own the verdict

| gate           | exit |
| -------------- | ---- |
| `format:check` | 0    |
| `lint`         | 0    |
| `lint:md`      | 0    |
| `test`         | 0    |
| `typecheck`    | 0    |
| `validate`     | 0    |

`node .dev/floor/check-verify.mjs .pharn/pharn-dev-verify/results.json --feature ci-smoke-built-bundle`
→ `"verdict": "PASS"`, `failing_gates: []`, exit **0**.

**VERIFIED: floor gates PASS.**

No `structural:*` gate appears in the map: this increment ships no committed eval pair (it adds no
Capability and emits no `findings.json`), so by the same convention `/pharn-dev-regress` uses, there
is simply no such gate — an absence by membership, not a skipped check.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Read that as "this layer contributed nothing", never
as "the verifiers approved it": zero occupants is the repo's honest state (P7), not a pass.

## What the increment's own tests actually pin, and how that was checked

The floor table above says the suite is green; it does not say the new assertions are load-bearing. So
the pin was **mutated and observed** rather than trusted:

- Deleting the `Smoke the built bundle` step from the live `.github/workflows/ci.yml` turned
  `tests/ci-workflow.test.ts` **RED** (the per-gate exact-array assertion fired). The workflow was then
  restored byte-for-byte from a pre-mutation copy and the suite re-run green.
- That same mutation exposed a flaw in the first draft of the test: an index-compare asserting the smoke
  runs *after* `npm run build` could never fail on its own, because the exact-array equality above it
  already pins the whole run list in order. An assertion that cannot independently fail is decoration,
  not coverage (P0) — it was **removed**, and the reasoning left in a comment so it is not
  re-added later as an apparent improvement.

Separately, the artifact the CI step will execute was run locally exactly as the step runs it:
`npm run build` (exit 0), then `node dist/index.js --version && node dist/index.js --help` (exit 0,
printing `0.4.0` and the usage text).

## Honest residual

**Verified = the named gates passed.** This is NOT a guarantee of correctness beyond what those gates
check, and verifier concerns — had any existed — would be advisory help, not assurance.

Two limits specific to this increment, worth naming because a green `Build` check is easy to
over-read:

1. **Nothing here executes GitHub Actions.** The gates verify the repo; they cannot verify that the
   runner behaves as expected. That the step passes was established locally and by pinning the file —
   which is the same standing every other gate in `ci.yml` has, not a new gap.
2. **The step itself proves loading, not working.** `--version` and `--help` both return from `main()`
   before any command dispatch, so no `pharn` command, network call, or filesystem write is exercised.
   A green `Build` means the bundle's module graph resolves and two flags print — never "the CLI works".
