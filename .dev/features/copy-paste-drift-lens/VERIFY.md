# VERIFY — copy-paste-drift lens

**Question answered:** was the copy-paste-drift lens built CORRECTLY — does it satisfy its own requirements as its
deterministic suite encodes them? **Verdict source:** `.dev/floor/check-verify.mjs` (exit-code threshold: PASS iff
every gate exit 0). The FLOOR layer OWNS this verdict; the verifier layer only annotates (fix #3).

## FLOOR layer — deterministic gates at HEAD (whole-repo, feature present)

| gate                                   | exit | result |
| -------------------------------------- | ---- | ------ |
| test (`npm test`, hermetic)            | 0    | PASS   |
| validate (`.dev/floor/validate.mjs .`) | 0    | PASS   |
| lint (`eslint`)                        | 0    | PASS   |
| format:check (`prettier`)              | 0    | PASS   |
| lint:md (`markdownlint`)               | 0    | PASS   |

- The `test` gate re-runs the hermetic suite **including the feature's own** `.dev/floor/scan-code-copy-paste-drift.test.mjs`
  (the 10 scanner tests — ★ injection-immunity + the honest-bound negatives) alongside the whole repo (all green).
- The `format:check` + `lint:md` + `lint` + `test` set is exactly the repo's `npm run check` aggregate, so this
  verdict **tracks the full `npm run check`** (L9 — style coverage at verify).
- **No `structural:*` gate:** the feature ships an `expected` (`expected-drift-injection.json`) but **no committed
  actual** (`findings.json`) — live emission is a later increment — so there is no committed eval **pair** to range a
  `check-structural` gate over (exactly as `swallowed-exception` / the current lens family). The expected's
  `structural[]` was nonetheless confirmed **satisfiable** during build (a scratch GREEN check) and its no-laundering
  trip-wire **fires** (a scratch RED demo) — but those are build-time evidence, not a committed verify gate.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** (`.dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.)
Step 2 is a no-op; zero verifiers are authored speculatively (P7). No verifier free-text is produced, so no untrusted
advisory text enters this report.

## Verdict

**VERIFIED: floor gates PASS** (`verdict: "PASS"`, `check-verify.mjs` exit 0; `failing_gates: []`).

**Honest residual (P0/P7):** verified = the named gates passed; this is **NOT** a guarantee of correctness beyond
what those gates check. A defect no test/eval/rule/lint covers is invisible to this verdict, and the verifier layer
that might notice it is advisory, not a guarantee. In particular, the lens's **advisory drift judgment** (is a given
odd-one-out a real bug?) and its **live emission under injection** are not gated here — they are, by design, the
lens's advisory layer and a future increment. The scanner's deterministic SHAPE detection **is** covered (its unit
tests, run by `test`).
