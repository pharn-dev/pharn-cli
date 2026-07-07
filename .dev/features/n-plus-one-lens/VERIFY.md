# VERIFY — n-plus-one-lens

- **Question answered:** did the `n-plus-one` lens get built CORRECTLY — do the deterministic gates pass with it present?
- **Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit-code threshold):** `PASS` — every gate exit 0.

## FLOOR layer — the deterministic gate table (owns the verdict)

| gate           | exit | meaning                                                                               |
| -------------- | ---- | ------------------------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — the whole hermetic suite (562 pass, incl. the new 24-test scanner suite) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` GREEN — 34 capabilities                                   |
| `lint`         | 0    | eslint clean                                                                          |
| `format:check` | 0    | prettier clean (see note)                                                             |
| `lint:md`      | 0    | markdownlint clean                                                                    |

- **No `structural:<expected>` gate:** this feature ships **no committed eval-actual pair** (expected fixtures only; the live lens runner is deferred P7), so there is no `structural:*` gate — exactly the `off-by-one` precedent. The eval fixtures' behavior is pinned for when the runner lands (two clocks).

> **format:check note (honest):** the first gate run flagged 3 of this increment's own files (`GRILL.md`, `REGRESSION.md`, `scan-code-n-plus-one.test.mjs`) as not prettier-clean → an initial `FAIL`. They were reformatted with `prettier --write` (mechanical whitespace/wrapping only — no semantic change; the scanner suite is still 24/24 green and the findings/verdicts in the trace files are unchanged), and the whole gate set was re-run GREEN. The table above is the re-run.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.** Step 2 is a no-op (P7 — none authored speculatively); the verdict is the floor gates alone.

## Verdict

**VERIFIED: floor gates PASS.**

Honest residual (P0/P7): _verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance, and none are registered today._ The lens's own guarantee is narrower still (it detects the query-in-loop SHAPE, not a harmful N+1 — see the lens's Guarantee audit); a green verify does **not** mean the lens will catch every N+1 or that any reviewed code is N+1-free.
