# VERIFY — remove-dead-docs-url

**Verdict (FLOOR, `check-verify.mjs`):** `VERIFIED: floor gates PASS` — exit `0`, `failing_gates: []`.

## FLOOR gates (whole-repo, at HEAD with the feature present)

| gate           | exit | meaning |
| -------------- | ---- | ------- |
| `test`         | 0    | vitest suite green (594/594 — includes `install`/`constants` coverage) |
| `validate`     | 0    | structural floor GREEN (no PHARN markdown capability added; vacuously green) |
| `lint`         | 0    | eslint clean — no orphaned `DOCS_URL` import left behind |
| `format:check` | 0    | prettier clean, whole-repo |
| `lint:md`      | 0    | markdownlint clean, whole-repo |

No `structural:*` gate — this increment ships no committed eval pair (it is a product-code deletion, not a Capability).

Note: verify's `test` gate is **vitest** (`npm test`, `tests/**/*.test.ts`), which is where this feature's real correctness surface lives (`install`/`constants` tests). It is independent of the `node --test` `.mjs`/`.cjs` runner that `/pharn-dev-regress` uses — so the pre-existing `test-app`/`lens-scanner-map` node-runner drift noted in `REGRESSION.md` does **not** touch this verdict.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone.

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance, and none exist today. Specifically: the deletion is proven complete by `lint` (no unused import) + `test`/`typecheck`-adjacent coverage + the build-time `grep -rn DOCS_URL src` → empty; what the gates cannot see (e.g. the cosmetic post-install outro rendering, which has no test) remains an advisory nit already surfaced in `GRILL.md`.
