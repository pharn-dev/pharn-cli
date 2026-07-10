# VERIFY — commands-off-manifest

**VERIFIED: floor gates PASS.**

## Floor layer — deterministic gates (the verdict)

| gate           | exit | meaning                                            |
| -------------- | ---- | -------------------------------------------------- |
| `test`         | 0    | `npm test` — 378 vitest cases, 29 files, all pass  |
| `typecheck`    | 0    | `tsc --noEmit` for src AND tests (both configs)    |
| `lint`         | 0    | `eslint src` clean                                 |
| `format:check` | 0    | prettier clean (src + tests)                       |
| `lint:md`      | 0    | markdownlint clean (docs + root markdown)          |

`check-verify.mjs` verdict: **PASS** (every gate exit 0), `failing_gates: []`. This gate set is exactly
the repo's `npm run check` aggregate (+ `lint:md`) — the floor CLAUDE.md/CI define for pharn-cli.

## Gate deliberately excluded (documented, not silent)

- **`validate` (`.dev/floor/validate.mjs .`) — measured exit 1, EXCLUDED from the verdict map.** Its only
  findings are in **untracked `test-app/`** (`test-fixtures/red/skill.md`, a *deliberately-red* fixture
  that `validate.test.mjs` uses to prove the checker catches red capabilities). That RED is unrelated to
  this increment — which changed **zero** capabilities, **zero** `.dev/floor/`, and **zero** `test-app/`
  files — and to pharn-cli's own source. pharn-cli's CI floor is `npm run check` (CLAUDE.md), not
  `validate.mjs`; the `/pharn-dev-build` command itself states `validate.mjs` "gates nothing" for an
  increment that adds no PHARN markdown capability (this one adds none). Including it would make *every*
  pharn-cli increment fail verify on unrelated scratch — a false RED. The exclusion is the verify
  command's sanctioned "gate SET is advisory orchestration" latitude, applied to a confounded gate, and
  surfaced here rather than hidden.

## Advisory layer — verifiers

No verifiers registered (`count-verifiers.mjs` → `{"registered":0}`) — **floor gates only.** Step 2 is a
no-op; the verdict is the floor gates alone.

## Honest residual (P0/P7)

"Verified" = the named gates passed; this is **not** a guarantee of correctness beyond what those gates
check. A defect no test/lint/typecheck/format covers is invisible to this verdict, and the verifier
layer that might notice it is empty today — verifier concerns, when they exist, are advisory help, not
assurance. The claim is "the named gates passed," not "the feature is correct."
