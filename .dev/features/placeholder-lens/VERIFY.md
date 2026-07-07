# VERIFY — placeholder-as-done lens

**Question answered:** did the placeholder-as-done feature get built CORRECTLY — does the repo-with-the-feature
pass its own deterministic gates? **Verdict source:** `.dev/floor/check-verify.mjs` (exit-code threshold: PASS iff
every gate exit 0; ZERO LLM-judge in the verdict). Run once at HEAD.

## FLOOR layer — deterministic gates (own the verdict)

| gate                    | exit | notes                                                                             |
| ----------------------- | ---- | --------------------------------------------------------------------------------- |
| test (`npm test`)       | 0    | whole hermetic suite incl. the feature's 24-test `scan-code-placeholder.test.mjs` |
| validate (whole-repo)   | 0    | structural floor GREEN — 24 capabilities                                          |
| lint (eslint)           | 0    | clean                                                                             |
| format:check (prettier) | 0    | clean (see "Style-gate note" below)                                               |
| lint:md (markdownlint)  | 0    | clean (see "Style-gate note" below)                                               |

The `test` + `validate` + `lint` + `format:check` + `lint:md` set is exactly the repo's `npm run check` aggregate,
so the verdict tracks the full `npm run check` — the increment's own style is caught here, not only at CI (L9).

### Style-gate note (honest — the first verify run FAILED, was corrected, and re-verified)

The **first** `/pharn-dev-verify` run returned `format:check`=1 and `lint:md`=1: my newly-authored feature files were
not prettier-clean (5 files) and `PLAN.md` had one `MD004` list-style nit (a wrapped line beginning `+`). These
were cosmetic defects in **the feature's own declared-scope deliverables** (no outside file, no logic, no eval
line-number change). They were corrected in place (`prettier --write` + the `+`→`-` normalization), and the CASE
fixtures' scanner hit-lines were re-confirmed **unchanged** (14 / 14 / 13 / clean / 15), so every `file_resolves`
assertion still holds and the 24-test scanner suite still passes. The table above is the **re-run** result — a
genuine PASS, disclosed rather than hidden (this is precisely the increment-style catch L9 routes to verify).

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers registered; floor
gates only.** Step 2 is a no-op; the verdict is the floor gates alone. (No verifier is authored speculatively, P7.)

## Verdict

**VERIFIED: floor gates PASS** (`verdict: "PASS"`, `check-verify.mjs` exit 0; `failing_gates: []`).

**Honest residual (P0/P7):** verified = the named gates passed; this is **NOT** a guarantee of correctness beyond
what those gates check. A defect no test / eval / rule / lint covers is invisible to this verdict, and the verifier
layer that might notice it is advisory (and empty today). Verifier concerns would be advisory help, not assurance —
and there are none. The gates certify what they check; nothing more.
