# VERIFY — duplicated-logic lens

- **Feature:** `duplicated-logic-lens`
- **Verdict (FLOOR — `.dev/floor/check-verify.mjs`): `PASS` (exit 0).** Every named gate exited 0.

## FLOOR layer — deterministic gates (own the verdict)

| gate         | exit | notes                                                                                               |
| ------------ | ---- | --------------------------------------------------------------------------------------------------- |
| test         | 0    | full hermetic suite incl. the feature's own `scan-code-duplicated-logic.test.mjs` (14 ★/edge tests) |
| validate     | 0    | structural floor GREEN — 25 capabilities                                                            |
| lint         | 0    | eslint clean (repo-wide)                                                                            |
| format:check | 0    | prettier clean (repo-wide)                                                                          |
| lint:md      | 0    | markdownlint clean (repo-wide)                                                                      |

`failing_gates: []`. The gate set is exactly the repo's `npm run check` aggregate (`format:check` +
`lint` + `lint:md` + `test`) plus `validate` — so the verdict tracks the full style+structure suite (L9).
No `structural:*` gate: the feature ships eval `expected/*.json` but **no committed actual `findings.json`**
(no live lens runner yet, deferred P7), so — exactly as the prior lens feature — there is no committed
eval-actual pair to range a structural gate over. The feature's exact-block behaviour is instead pinned
by the scanner's own hermetic tests (in `test`) and, at eval time, by `check-structural` over the
committed `expected/*.json` once the runner lands.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `.dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}` (deterministic frontmatter membership, not a prose grep). Step 2 is a
no-op; `verifiers: { registered: 0, findings: [] }`. No verifier is authored speculatively (P7).

## Verdict

**VERIFIED: floor gates PASS.**

Honest residual (P0/P7): _verified = the named gates passed; this is **NOT** a guarantee of correctness
beyond what those gates check_ — a defect no test/eval/rule/lint/format covers is invisible to this
verdict, and the verifier layer that might notice it is advisory (and empty today). In particular, the
lens's exact-duplication floor is bounded (exact-match, single-file; near-identical and cross-file are
out of scope) — "gates passed" never means "the code is free of duplication." Verifier concerns, when
they exist, are advisory help, not assurance.
