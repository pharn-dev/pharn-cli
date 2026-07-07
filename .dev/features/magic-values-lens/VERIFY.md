# VERIFY — magic-values lens

- **Feature:** `magic-values-lens`.
- **Verdict (FLOOR, `.dev/floor/check-verify.mjs`):** `VERIFIED: floor gates PASS` — exit 0 (every gate exit 0).

## FLOOR layer — deterministic gates (own the verdict)

| gate           | exit | result |
| -------------- | ---- | ------ |
| `test`         | 0    | PASS   |
| `validate`     | 0    | PASS   |
| `lint`         | 0    | PASS   |
| `format:check` | 0    | PASS   |
| `lint:md`      | 0    | PASS   |

- `test` — `npm test` (the hermetic `node --test` suite, incl. the feature's own 24-test
  `scan-code-magic-values.test.mjs`) is green.
- `validate` — `.dev/floor/validate.mjs .` is GREEN (31 capabilities; the `magic-values` lens is
  discovered, frontmatter + evals present, `enforces: [P2]` bound by ≥1 eval, `coupling` enum,
  finding-shape split, no sibling reference).
- `lint` / `format:check` / `lint:md` — ESLint, Prettier, and markdownlint are clean whole-repo (the
  `npm run check` aggregate, closing L9's style-gate hole at verify).
- **No `structural:*` gate** — the feature ships eval `expected/*.json` but **no committed actual
  `findings.json`** (its findings are produced live at `/pharn-dev-eval`, not committed), exactly as the
  `off-by-one` sibling; a feature with no committed eval-actual pair simply has no `structural:*` gate.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only** (`.dev/floor/count-verifiers.mjs .` → `{"registered":0}`).
Step 2 is a no-op; the verdict is the floor gates alone. No verifier is authored speculatively (P7).

## Honest residual (P0/P7)

**Verified = the named gates passed; this is NOT a guarantee of correctness beyond what those gates
check.** A defect no test/eval/rule/lint covers is invisible to this verdict, and the verifier layer that
might notice it is advisory, not a guarantee. In particular, the **semantic** eval assertions (whether
the lens's live output is _justified_ by the scanner shape and _fences_ the injection under a real
`claude -p` run) are the advisory `llm-judge` half measured at `/pharn-dev-eval`, **not** here — verify
certifies the deterministic gates only. Feature correctness beyond the gates is the human's call at the
post-review gate.
