# VERIFY — deserialization-lens (did the feature get built CORRECTLY?)

Two layers, kept strictly separate: the **FLOOR layer** owns the verdict (every gate exit 0 → PASS); the **ADVISORY layer** (verifiers) only annotates.

## FLOOR layer — deterministic gates (whole-repo, run once at HEAD)

| gate           | exit | meaning                                                                     |
| -------------- | ---- | --------------------------------------------------------------------------- |
| `test`         | 0    | `npm test` — 279/279 hermetic tests (incl. the feature's own scanner suite) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — FLOOR GREEN, 18 capabilities                  |
| `lint`         | 0    | `eslint .` clean                                                            |
| `format:check` | 0    | `prettier --check .` clean                                                  |
| `lint:md`      | 0    | `markdownlint-cli2` clean                                                   |

No `structural:*` gate: the feature ships expected fixtures but no committed actual `findings.json` (the live lens runner is deferred, P7) — so there is no committed eval-actual pair to check, exactly as for the `injection` lens.

## Note on a build-completeness fix during verify (honesty, P0/P6)

The first gate run returned `format:check 1` and `lint:md 1` — **only** on files this increment newly wrote (prettier formatting on `PLAN.md` / `GRILL.md` / `REGRESSION.md` / `expected-safe-yaml.json`; markdownlint MD004/MD028/MD060). The files were not style-clean as built, and the repo's style gates are part of `npm run check`, so the build was not yet complete. Remedied with the repo's **own deterministic auto-formatters** — `prettier --write .` and `markdownlint-cli2 --fix` — plus one manual fix (MD028: the lens's P7-trigger blockquote was converted to a plain paragraph so it no longer sits adjacent to the untrusted-input-fence blockquote). All changes are **cosmetic — no behavior change** (`test` and `validate` remained 0 throughout; the scanner's 19 hermetic tests are unaffected). The gates were then re-run and are GREEN. Residual cosmetic wart, noted not hidden: `markdownlint --fix` rewrote a wrapped `+` in the **advisory** `PLAN.md` prose (a literal "JSON.parse + unsafe merge") to `-`, so that one trace line now reads as a stray list item — harmless (advisory trace, gates green), left as-is.

## ADVISORY layer — verifiers

`.dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.** (Zero authored, per P7 — the slot is defined; no verifier is written speculatively.)

## Verdict (deterministic — `.dev/floor/check-verify.mjs`, exit 0)

**VERIFIED: floor gates PASS** (`test` · `validate` · `lint` · `format:check` · `lint:md` all exit 0; `failing_gates: []`).

Honest residual (P0/P7): _verified = the named gates passed_ — this is **NOT** a guarantee of correctness beyond what those gates check. A defect no test / eval / rule / lint covers is invisible to this verdict, and the verifier layer that might catch it is advisory (and empty today). "The named gates passed," never "the feature is correct." Whether the lens is genuinely sound is the human's call at the post-review gate.
