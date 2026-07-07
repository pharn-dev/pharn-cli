# VERIFY — null-deref lens

**Question answered:** did the null-deref lens get built **correctly** — does the repo-with-the-feature satisfy its
own deterministic requirements? **Verdict source:** `.dev/floor/check-verify.mjs` (exit-code threshold, PASS iff
every gate exit 0; ZERO LLM-judge). The built increment is `trust: untrusted`; the verdict reads only gate exit
codes (ints), never a finding's free-text (P2).

## FLOOR layer — deterministic gates (own the verdict)

| gate         | exit | meaning                                                                   |
| ------------ | ---- | ------------------------------------------------------------------------- |
| test         | 0    | `npm test` — full hermetic suite incl. the feature's 24 new scanner tests |
| validate     | 0    | `.dev/floor/validate.mjs .` — structural floor GREEN, 27 capabilities     |
| lint         | 0    | `npm run lint` — eslint clean                                             |
| format:check | 0    | `npm run format:check` — prettier clean (whole-repo)                      |
| lint:md      | 0    | `npm run lint:md` — markdownlint clean (whole-repo)                       |

No `structural:<expected>` gate: the feature ships eval `expected` fixtures but **no committed actual
`findings.json`** (the live lens runner is deferred, P7), so there is no eval-actual pair to range over — exactly as
`swallowed-exception` / `trust-fence` handle it. The scanner's determinism is instead pinned by its own hermetic
`.dev/floor/scan-code-null-deref.test.mjs` (24 tests, collected by `npm test` above) — including the ★
injection-immunity, guard/optional-chain true-negatives, the fixed-source-set false-positive bound, the
first-occurrence discipline (guard-after-deref still HIT), word-boundary matching, and fail-closed.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `.dev/floor/count-verifiers.mjs .` → `{"registered":0}` (deterministic
frontmatter membership, P5). Step 2 is a no-op; the verdict is the floor gates alone (P7 — no verifier authored
speculatively).

## Verdict

**VERIFIED: floor gates PASS.** (`verdict: "PASS"`, `check-verify.mjs` exit 0, `failing_gates: []`.)

**Honest residual (P0/P7):** verified = the named gates passed; this is **NOT** a guarantee of correctness beyond
what those gates check — a defect no test/eval/rule/lint covers is invisible to this verdict, and the verifier layer
that might notice it is advisory, not a guarantee. The gates ensure what they check; nothing more (P0).
