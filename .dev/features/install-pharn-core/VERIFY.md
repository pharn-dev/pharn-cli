# VERIFY — install-pharn-core

## FLOOR layer (owns the verdict)

| gate           | exit | meaning                                                          |
| -------------- | ---- | ---------------------------------------------------------------- |
| `test`         | 0    | the hermetic vitest suite — 814 tests, 43 files, incl. the new 11 |
| `validate`     | 0    | the structural floor over the repo                                |
| `lint`         | 0    | eslint, `--max-warnings 0`                                        |
| `format:check` | 0    | prettier over `src`/`tests`/`*.config.ts`                         |
| `lint:md`      | 0    | markdownlint over `docs/**/*.md` + `*.md` (23 files)              |

`check-verify.mjs` → exit `0`, `verdict: "PASS"`, `failing_gates: []`.

This gate set is exactly the repo's `npm run check` aggregate, so the verdict tracks the full
`npm run check` — the L9 style-gate coverage the increment's own markdown would otherwise only meet at
CI. **Honest note on the two clocks (L9, P0):** `check-verify.mjs` is generic over gate keys — it
computes PASS iff every gate is 0 over **whatever** map this stage assembles. That the two style gates
are *in* the map is this stage's **advisory** composition; no floor primitive locks them there.

**No `structural:*` gate.** This repo ships no committed `<cap>/evals/expected/*.json` ↔ `findings.json`
pair, so by the same membership rule `/pharn-dev-regress` uses, the gate is simply absent — not skipped,
not assumed green. The feature-specific correctness signal here is entirely the feature's own
`*.test.*` collected by `npm test`.

**Granularity, stated (P7):** all five gates are **whole-repo** — PASS means the whole repo is green
with this increment in it, not merely that the increment's own files are.

## ADVISORY layer (annotates; never gates)

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op and the verdict is the floor gates
alone. No verifier free-text was produced, so no untrusted `problem`/`evidence` entered this report;
the taint boundary is in place for when one lands. No verifier is authored speculatively (P7).

The `/pharn-dev-grill` findings from earlier in this chain are **not** an input here either — grill is
advisory end-to-end and its severities are LLM assignments. They are carried to the human at the
post-review gate, not folded into this verdict.

## Verdict

**VERIFIED: floor gates PASS.** (`verdict: "PASS"`, `check-verify.mjs` exit `0`.)

Honest residual (P0/P7): _verified = the named gates passed; this is **NOT** a guarantee of correctness
beyond what those gates check — verifier concerns are advisory help, not assurance._ A defect that no
test, eval, rule, or lint covers is invisible to this verdict, and the advisory layer that might have
noticed it is empty today. What is certified is the five gates above, nothing wider.
