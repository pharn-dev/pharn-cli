# VERIFY — hallucinated-api lens

- **feature:** `hallucinated-api-lens`
- **verdict:** **`PASS`** (`.dev/floor/check-verify.mjs` exit 0 — every gate exit 0; deterministic, no LLM)

## FLOOR layer — deterministic gates (own the verdict)

| gate                                               | exit | result |
| -------------------------------------------------- | ---- | ------ |
| `test` (`npm test`, hermetic suite — 348 pass)     | 0    | OK     |
| `validate` (`.dev/floor/validate.mjs .` — 22 caps) | 0    | OK     |
| `lint` (eslint)                                    | 0    | OK     |
| `format:check` (prettier, whole-repo)              | 0    | OK     |
| `lint:md` (markdownlint, whole-repo)               | 0    | OK     |

No `structural:*` gate: the feature ships eval `expected/*.json` but **no committed actual `findings.json`** (the
live `claude -p` eval runner is the deferred 3c increment), so — exactly as `/pharn-dev-regress` handles it — there
is no committed eval-actual pair to range a `structural:<expected>` gate over. The feature's own fixtures are
`check-structural`-checkable at eval-time once an actual is emitted; that is not a `/pharn-dev-verify` gate today.

> **Method note (honest, P6/L9).** The first `format:check` + `lint:md` run **failed** on the increment's own
> new markdown (mixed `*`/`_` emphasis → MD049; one `+` bullet → MD004; prettier prose-wrap) — precisely the L9
> case: the build stage runs only `validate.mjs`, so an increment's own markdown style is first checked here at
> verify. Fixed mechanically by running the repo's own formatter (`prettier --write`) over the new files, which
> normalizes emphasis to `_` (consistent → MD049 clean) and bullets to `-` (MD004 clean) — the same style every
> existing lens uses. The three eval **case** files were unchanged by prettier, so the `file_resolves` line
> citations (`:14`, `:16`) still hold; `validate.mjs` re-run GREEN after formatting. This is completing a clean
> build, not iterating on a substantive verify failure.

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}` (deterministic frontmatter membership, P5). Zero `role: verifier` capabilities
exist (P7 — none authored speculatively), so Step 2 is a no-op and the verdict is the floor gates alone. No
advisory findings to append.

## Verdict

**VERIFIED: floor gates PASS.** The named deterministic gates passed at HEAD with the feature present.

**Honest residual (P0/P7):** verified = **the named gates passed** — this is **NOT** a guarantee of correctness
beyond what those gates check. A defect no test / eval / rule / lint covers is invisible to this verdict, and the
verifier layer that might notice it is advisory (and empty today). In particular, whether the lens's **advisory**
API-existence judgment is _accurate_ on live code is **not** gated here (it has no scanner, by design) — that is
the lens's honest advisory nature, confirmed, not certified. Verifier concerns would be advisory help, not
assurance.
