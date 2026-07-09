# VERIFY — archetype-path-context

**Verdict (FLOOR, `check-verify.mjs`):** `VERIFIED: floor gates PASS` — exit `0`.

Did the feature get built CORRECTLY (does it satisfy its own requirements)? The deterministic gates over
the repo-with-the-feature-in-it all pass. "verified" = these gates passed — nothing more.

## FLOOR layer — deterministic gates (own the verdict)

| gate           | exit | what it covers |
| -------------- | ---- | -------------- |
| `test`         | 0    | vitest suite (566 passed), incl. the feature's own updated + 16 new cases |
| `validate`     | 0    | `.dev/floor/validate.mjs .` structural floor (GREEN — 0 markdown capabilities, vacuous) |
| `lint`         | 0    | eslint clean over `src` |
| `format:check` | 0    | prettier clean (whole-repo) |
| `lint:md`      | 0    | markdownlint clean (`docs/**`, root `*.md`) — L9 style coverage at verify |

`verdict: PASS` · `failing_gates: []`. The gate set is exactly the repo's `npm run check` surface, so the
verdict tracks the full check (L9 — the increment's own style is caught here, not only at CI).

## ADVISORY layer — verifiers

`count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers registered; floor gates
only.** Step 2 is a no-op; no advisory findings were produced (none exist to produce them), and none could
have flipped the verdict regardless (fix #3 — verifier judgment annotates, never gates).

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates
check. A defect no test/eval/rule/lint covers is invisible to the floor verdict, and the verifier layer
that might notice it is advisory (and empty today). Verifier concerns, when they exist, are advisory help,
not assurance. The feature-specific correctness signal here is the feature's own `*.test.ts` (collected by
`npm test`) — the 18 archetype/parseApplies cases exercising each scoped rule's ✗/✓ behavior; whole-repo
`test`/`lint`/`format:check`/`lint:md`/`validate` confirm the repo is green with the feature present.
