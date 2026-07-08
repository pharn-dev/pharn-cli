# VERIFY — fresh-check-git-rce

Feature verified at HEAD (working tree, feature present). Verdict owned by the FLOOR layer
(`.dev/floor/check-verify.mjs` — `PASS iff every gate exit 0`); verifiers annotate only (none exist).

## FLOOR layer — deterministic gates (own the verdict)

| gate | exit | meaning |
| --- | --- | --- |
| `test` (`npm test` — full vitest suite incl. the feature's RCE tests) | 0 | 519 tests green |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 | structural floor GREEN |
| `lint` (`eslint src`) | 0 | clean |
| `format:check` (prettier, whole-repo) | 0 | clean |
| `lint:md` (markdownlint, `docs/**/*.md` + `*.md`) | 0 | clean |

No `structural:*` gate: the increment ships no PHARN markdown-capability eval pair (it is a
TypeScript CLI fix; its P1 obligation is the vitest regression test, collected by `test`).

**VERIFIED: floor gates PASS** — `failing_gates: []`.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. **No verifiers registered —
floor gates only.** Step 2 is a no-op; nothing annotates or could flip the verdict (fix #3).

## Residual (named, not hidden — P0/P7)

Verified = **the named gates passed**; this is **NOT** a guarantee of correctness beyond what those
gates check — verifier concerns would be advisory help, not assurance, and none exist today. The
security invariant's own demonstration lives in `test` (the red→green RCE regression in
`tests/fresh-check.test.ts`). The merge/fix/abandon decision remains the human's at the post-review
gate.
