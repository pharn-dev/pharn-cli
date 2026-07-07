# VERIFY — swallowed-exception lens

**Question answered:** was the swallowed-exception lens built **correctly** — is the whole repo (with the feature in
it) green under the project's own deterministic gates? **Verdict source:** `.dev/floor/check-verify.mjs` (absolute
exit-code threshold: PASS iff every gate exit 0). Run once at HEAD (working tree with the feature present).

## FLOOR layer — the deterministic gates (own the verdict)

| gate         | exit | meaning                                                              |
| ------------ | ---- | -------------------------------------------------------------------- |
| test         | 0    | full hermetic suite green (incl. the feature's 23 new scanner tests) |
| validate     | 0    | structural floor GREEN — 23 capabilities                             |
| lint         | 0    | eslint clean                                                         |
| format:check | 0    | prettier clean (whole-repo)                                          |
| lint:md      | 0    | markdownlint clean (whole-repo)                                      |

No `structural:<expected>` gate: the feature ships eval `expected` fixtures but **no committed actual
`findings.json`** (the live lens runner is deferred, P7), so there is no eval-actual pair to range over — exactly as
the `injection` lens precedent. The feature's own correctness signal is its 23 committed scanner tests (collected by
`npm test`) + the floor `validate`.

**Deterministic verdict: `VERIFIED: floor gates PASS`** (`verdict: "PASS"`, `failing_gates: []`,
`check-verify.mjs` exit 0).

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers registered; floor gates
only.** Step 2 is a no-op (P7 — none authored speculatively). No advisory free-text is produced, so no tainted field
exists to bound; the verdict rests solely on the floor gate exit codes.

## Spec pin (dev pipeline)

The dev pipeline pins its spec as `sha256(ARCHITECTURE.md)` (fix #4), re-verified matching the plan's
`spec_content_hash` at `/pharn-dev-build` and `/pharn-dev-grill` this run. (`.dev/floor/check-plan-spec-agree.mjs` is the
**product** pipeline's `SPEC.md` chain checker and does not apply here — the dev spec is `ARCHITECTURE.md`, not a
`SPEC.md`.)

## Process note (honest)

The whole-repo `format:check` initially flagged **one** file — this run's own `REGRESSION.md` trace artifact
(hand-written by the regress stage, not a feature file) — which was normalized with prettier before the verdict was
computed. All feature files were prettier-clean from build. Observation for the pipeline: stages should emit
prettier-clean markdown artifacts, else the whole-repo `format:check` trips at verify (an L9-style style-coverage
point).

## Honest residual (P0/P7)

**Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates check —** verifier
concerns would be advisory help, not assurance, and none are registered. A defect no test/eval/rule/lint/validate
covers is invisible to this verdict. "The named gates passed," never "the feature is correct."
