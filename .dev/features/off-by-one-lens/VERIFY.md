# VERIFY — off-by-one-lens

- **verdict (floor, `.dev/floor/check-verify.mjs`):** `PASS` — exit 0 (PASS iff every gate exit 0)
- **verifiers:** none registered (`.dev/floor/count-verifiers.mjs` → `{"registered":0}`) — **floor gates only**

## Floor gates (whole-repo, at HEAD with the feature present)

| gate           | exit | what it checks                                                                                       |
| -------------- | ---- | ---------------------------------------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — full hermetic suite, incl. the feature's own `scan-code-off-by-one.test.mjs` (16 cases) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — structural floor GREEN (29 capabilities)                               |
| `lint`         | 0    | `npm run lint` — eslint clean                                                                        |
| `format:check` | 0    | `npm run format:check` — prettier clean (whole repo)                                                 |
| `lint:md`      | 0    | `npm run lint:md` — markdownlint clean (whole repo)                                                  |

**failing_gates:** none.

## Feature-specific signal (honest granularity — P7)

- The feature's own deterministic test — `.dev/floor/scan-code-off-by-one.test.mjs` — is collected by `npm test` above (the `<= <expr>.length` scanner: detection, the injection-immunity ★ cases, the `<` / `- 1` / `.length()` / `<<=` bounds, fail-closed). It passes.
- **No `structural:*` gate for this feature:** the off-by-one lens ships committed `evals/expected/*.json` (its behavior spec), but **no committed eval-ACTUAL** (`findings.json`) yet — producing one requires a live `claude -p` lens run (the deferred/manual `/pharn-dev-eval`, as for every lens, P7). So the lens's live finding-output is **not** deterministically checked in this pipeline run; its `expected` files pin the spec for that later eval. Stated, not hidden.

## Verifier layer (advisory)

No verifiers registered — Step 2 is a no-op; the verdict is the floor gates alone. (When a `role: verifier`
capability lands, its findings would be appended here as advisory DATA and would **never** flip the verdict — fix #3.)

## Verdict

**VERIFIED: floor gates PASS.**

**Honest residual (P0/P7):** verified = **the named gates passed** — this is **NOT** a guarantee of correctness
beyond what those gates check. A defect no test/eval/rule/lint covers is invisible to the floor verdict, and the
verifier layer that might notice it is advisory, not a guarantee. In particular, whether the off-by-one lens's
**live** finding-output matches its committed `expected` files is checked by a later manual `/pharn-dev-eval`, not
here. This report certifies the gates it ran — not that the feature is correct or wise; that is the human's call.
