# VERIFY — resource-leak-lens

Was the resource-leak lens built **correctly**? Answered through two strictly-separated layers: a
**FLOOR** layer that owns the pass/fail verdict (`.dev/floor/check-verify.mjs`, an exit-code threshold),
and an **ADVISORY** verifier layer that only annotates (none registered today).

## FLOOR layer — deterministic gates (own the verdict)

| gate           | exit | meaning                                                         |
| -------------- | ---- | --------------------------------------------------------------- |
| `test`         | 0    | `npm test` — full hermetic suite incl. the 20 new scanner tests |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — GREEN, 28 capabilities            |
| `lint`         | 0    | `npm run lint` — eslint clean                                   |
| `format:check` | 0    | `npm run format:check` — prettier clean (whole-repo)            |
| `lint:md`      | 0    | `npm run lint:md` — markdownlint clean (whole-repo)             |

- **No `structural:*` gate:** the resource-leak feature ships eval **expected** files but no committed
  **actual** `findings.json` (there is no live lens runner yet, deferred P7), so there is no committed
  eval-actual pair to range over — exactly as `/pharn-dev-regress` handles a feature with no pair. The
  feature's own deterministic correctness signal is instead its **19-test** `scan-code-resource-leak.test.mjs`
  (collected by `npm test`) plus `validate` GREEN (lens frontmatter + non-empty evals + `enforces: [P2]`
  eval-bound).

**VERIFIED: floor gates PASS** (`check-verify.mjs` → `"PASS"`, exit 0; `failing_gates: []`).

> **Re-run at GATE 2 (post-unref-fix).** After the initial PASS the human elected to address REVIEW's minor `unref` advisory before merging: `unref` was dropped from the scanner's cleanup set and a locking test added (scanner suite 19 → 20). These gates are the **re-run** over that change — still `test`/`validate`/`lint`/`format:check`/`lint:md` all `0`, verdict **PASS**.

### Honest note — an initial `format:check` FAIL, fixed (disclosed, not hidden)

The **first** gate run returned `format:check` exit 1. Diagnosis (`prettier --check .`) showed the sole
offender was **`.dev/features/resource-leak-lens/REGRESSION.md`** — a markdown table-alignment nit in the
**regress stage's own trace artifact** written earlier in this same `/pharn-dev-ship` run, **not** any
resource-leak feature file (all of `test`/`validate`/`lint`/`lint:md` were already 0). It was normalized
with the sanctioned formatter (`prettier --write`, a pure zero-judgment formatting change, the same
artifact-hygiene step the build stage applies), and the gates were re-run to the honest **PASS** above.
This corrected a pipeline-artifact omission; it changed no feature file and masked no feature defect.
(The whole-repo `format:check` behaving as an all-or-nothing gate over trace artifacts is the L9
style-coverage surface — cited, not restated.)

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered —
floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone. No verifier is authored
speculatively (P7). No verifier free-text is produced, so no untrusted DATA enters this report.

## Honest residual (P0/P7)

**Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check** — a defect no test/eval/rule/lint covers is invisible to this verdict, and the verifier layer
that might notice it is advisory, not a guarantee. In particular, `validate` GREEN + the scanner tests
prove the lens is _structurally_ well-formed and the scanner is _deterministically injection-immune on
its fixtures_ — they do **not** prove the lens "detects all resource leaks" (it detects a bounded SHAPE;
`resource-leak.md` §Guarantee-audit). Verifier concerns, when verifiers exist, are advisory help, not
assurance.
