# VERIFY — remove-prunes-records

## FLOOR layer — the deterministic gates (owns the verdict)

| gate           | exit | what it covers                                                                    |
| -------------- | ---- | ---------------------------------------------------------------------------------- |
| `test`         | 0    | the whole hermetic suite — **40 files / 654 tests**, including the feature's 11 new |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — the structural floor (0 capabilities; vacuously green) |
| `lint`         | 0    | `eslint src tests scripts --max-warnings 0` — any warning would fail                |
| `format:check` | 0    | prettier, whole-repo                                                                |
| `lint:md`      | 0    | markdownlint-cli2 over `docs/**/*.md` + `*.md`, whole-repo (L9)                     |

`test` + `lint` + `format:check` + `lint:md` are exactly the repo's `npm run check` aggregate, so this
verdict tracks the full `check`. **No `structural:*` gate ran:** this feature ships no committed eval
pair, and the repo has none outside `.dev/floor/test-fixtures/` — stated so its absence is not read as
a gate that passed.

**VERIFIED: floor gates PASS** — `.dev/floor/check-verify.mjs`, exit **0**, `failing_gates: []`.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 was a no-op, exactly as the empty-slot design
intends (P7: none is authored speculatively). No verifier free-text exists in this run, so nothing
tainted entered the report — the boundary is in place for when one lands.

## What the verdict does and does not mean

**verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check — verifier concerns are advisory help, not assurance.**

Two things the gates specifically do **not** cover here, named rather than left implied:

- Whether the prune's *design* is right — that a key-prefix filter is the correct shape and the stamp
  should not move — is an argument in `PLAN.md`, weighed by the human at the plan gate, not something
  any gate above measured.
- The manual end-to-end exercise against a real `dist/` build. It has **not** been run; the vitest
  fixtures are the record. The `test` gate covers the built behavior through mocked prompts and a real
  filesystem, which is a different thing from a real CLI invocation and is not a substitute for one.

Worth recording as the strongest signal the suite does carry, though it is **not** part of the floor
verdict: five targeted mutations of the new code — dropping the trailing slash, removing the
skip-write guard, gating the prune on `existed`, removing the baseline null-guard (together with the
skip-write guard, since alone it is a semantic no-op), and deleting the picker's prune call — each turn
at least one new test red. That is evidence the tests demonstrate rather than merely assert (P1); it is
an orchestration observation, and it did not enter the verdict.

**Orchestration honesty (two clocks):** the verdict above is floor-grade — an exit-code threshold over
integers, provably independent of any free-text field. Everything **I** did around it — choosing which
gates to run, running them, assembling the map — is **advisory**. In particular, `check-verify.mjs` is
generic over gate keys: nothing on the floor locks `format:check` / `lint:md` into the set; keeping
them there is this command's advisory composition (L9's remedy lives in that layer, by design).
