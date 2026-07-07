# VERIFY — capability-resolver

- **Verdict source:** `.dev/floor/check-verify.mjs` (deterministic exit-code threshold — `PASS iff every gate exit 0`). The verdict is owned by the FLOOR layer; the verifier layer only annotates.

## FLOOR layer — deterministic gates (owns the verdict)

| gate | exit | notes |
| --- | --- | --- |
| `test` | 0 | `npm test` — full vitest suite incl. the feature's 20 new cases (`archetype`, `resolve-capabilities`) |
| `validate` | 0 | `.dev/floor/validate.mjs .` — structural floor GREEN (0 capabilities; product TS adds none) |
| `lint` | 0 | `eslint src` clean |
| `format:check` | 0 | prettier clean (whole-repo, L9) |
| `lint:md` | 0 | markdownlint clean (whole-repo, L9) |

No `structural:*` gate: the feature ships no committed capability eval pair (it is product TS; its evals are the vitest suite, collected by `test`).

**VERIFIED: floor gates PASS.** (`check-verify.mjs` exit 0.)

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0}` — **no verifiers registered — floor gates only.** Step 2 is a no-op; no advisory findings were produced.

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check — a defect no test/eval/rule/lint covers is invisible to this verdict, and verifier concerns (none today) are advisory help, not assurance. "The named gates passed," not "the feature is correct."
