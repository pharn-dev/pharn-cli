# VERIFY — archetype-missing-signal

**Verdict (FLOOR, `check-verify.mjs` exit 0):** `VERIFIED: floor gates PASS`.

## FLOOR layer — deterministic gates (own the verdict)

| gate | exit | note |
| --- | --- | --- |
| `test` | 0 | `npm test` — whole suite (38 files / 373 tests), incl. `tests/detect-archetype.test.ts` (now asserting the `{ archetypes, packageJsonFound }` shape + the missing-vs-frameworkless distinction) |
| `validate` | 0 | structural floor GREEN (0 markdown capabilities) |
| `lint` | 0 | `eslint src` clean |
| `format:check` | 0 | prettier clean (whole-repo — L9) |
| `lint:md` | 0 | markdownlint clean (whole-repo — L9) |

- `failing_gates`: **none**. No `structural:*` gate (the increment ships no committed eval pair).

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `count-verifiers .` → `{"registered":0}`. `verifiers: { registered: 0, findings: [] }`.

## Honest residual (P0/P7)

`VERIFIED` = the named gates passed — **not** a guarantee of correctness beyond what those gates check. The verdict is floor-grade (an exit-code threshold, independent of any free-text); the orchestration around it is advisory; verifier concerns (none today) would be advisory help, not assurance.
