# VERIFY — secrets-lens (did the feature get built CORRECTLY?)

- **Verdict source:** `.dev/floor/check-verify.mjs` (FLOOR layer — PASS iff every gate exit 0). Advisory verifier layer: **0 registered**.

## FLOOR layer — deterministic gates (whole-repo, at HEAD)

| gate           | exit | meaning                                                     |
| -------------- | ---- | ----------------------------------------------------------- |
| `test`         | 0    | `npm test` — 240 tests pass (incl. the scanner's 9, both ★) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — GREEN, 15 capabilities        |
| `lint`         | 0    | `npm run lint` — eslint clean                               |
| `format:check` | 0    | `npm run format:check` — prettier clean                     |
| `lint:md`      | 0    | `npm run lint:md` — markdownlint clean                      |

- **No `structural:*` gate:** the feature ships committed eval `expected/*.json` but **no committed actual `findings.json`** — the lens's live emission is produced when the lens is run (the live lens/eval runner is deferred, P7), so there is no actual-vs-expected pair to check at verify time. Absent from the map, exactly as the contract allows.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone (P7 — no verifier authored speculatively).

## Verdict

**VERIFIED: floor gates PASS** — `check-verify.mjs` returned `"verdict":"PASS"` (exit 0), `failing_gates: []`.

**Honest residual (P0/P7):** verified = **the named gates passed**; this is **NOT** a guarantee of correctness beyond what those gates check. The lens's _judgment_ behavior on its evals (does it emit the right finding under injection?) is exercised when the lens is run live — the floor here covers the scanner's determinism (its own tests), the structural floor (`validate`), and whole-repo style/tests, **not** the lens's live output. Verifier concerns would be advisory help, not assurance — and there are none registered.

## Orchestration note (advisory)

The initial gate run had `format:check` and `lint:md` **red** — not on the product files (lens/scanner/evals were clean) but on two **pipeline-trace artifacts** I authored this run (`GRILL.md`, `REGRESSION.md`: a prettier reformat + a markdownlint MD060 table-alignment nit). I corrected them with the repo's own formatter (`npx prettier --write`, which also aligned the table to satisfy MD060) and re-ran the gates → all green. The reported PASS is post-correction; the fix was mechanical (whitespace/table alignment only, no content change) on my own trace docs. The **verdict** (exit-code threshold) is floor-grade; running/assembling the gates is advisory orchestration (the two clocks).
