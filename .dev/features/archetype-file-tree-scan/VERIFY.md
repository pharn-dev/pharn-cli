# VERIFY — archetype file-tree scan

**Verdict (FLOOR — `.dev/floor/check-verify.mjs`, exit 0): `VERIFIED: floor gates PASS`.**

The feature was built into the repo, and every named deterministic gate is GREEN over the
repo-with-the-feature-in-it (whole-repo, run at HEAD):

| gate           | exit | what it checks |
| -------------- | ---- | -------------- |
| `test`         | 0    | `vitest run` — the hermetic suite incl. the feature's own tests (401/401 pass) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` — the structural floor GREEN (0 markdown capabilities) |
| `lint`         | 0    | `eslint src` clean |
| `typecheck`    | 0    | `tsc --noEmit` (src + tests configs) clean |
| `format:check` | 0    | `prettier --check` clean (whole-repo) |
| `lint:md`      | 0    | `markdownlint-cli2` clean (whole-repo docs + root `*.md`) |

`failing_gates`: none. The gate set includes `typecheck` (added beyond the command's base list): this is a
TypeScript increment, so the type gate is the central correctness signal; `check-verify.mjs` is generic
over gate keys (PASS iff every gate exit 0), so including it only strengthens the floor.

No `structural:*` gate ran — the feature ships no committed `evals/expected/*.json` ↔ `findings.json`
pair (it is CLI TypeScript, whose regression-spec is its vitest suite, not a PHARN markdown-capability
eval).

## Advisory layer — verifiers

**No verifiers registered — floor gates only.** `node .dev/floor/count-verifiers.mjs .` →
`{"registered":0,"verifiers":[]}` (deterministic frontmatter membership, P5). Step 2 is a no-op; the
verdict is the floor gates alone. No verifier is authored speculatively (P7).

## Honest residual (P0/P7)

Verified = **the named gates passed** — this is NOT a guarantee of correctness beyond what those gates
check. A defect no test/eval/rule/lint/type-check covers is invisible to this floor verdict, and the
verifier layer that might otherwise notice it is advisory, not a guarantee. Verifier concerns (none
today) are advisory help, not assurance. `/pharn-dev-verify` certifies only the gates it ran.
