# REGRESSION — fresh-check-git-rce

- **Base:** `c44170e` (working-tree dogfood build → `base = HEAD`; changes are uncommitted).
- **Inside (feature scope):** `src/steps/fresh-check.ts`, `tests/fresh-check.test.ts` — both declared
  in `PLAN.md ## Files`. `check-regress.mjs scope` → `escaped: []` (no fix #7 breach).
- **Verdict engine:** `.dev/floor/check-regress.mjs verdict` (exit-code comparison; zero LLM judgment).

## Scope note (dogfood artifact vs. gitignore)

`git diff HEAD` also shows `.pharn/writes-scope.json` (rewritten by every stage's scope-setter) and
untracked `.dev/features/fresh-check-git-rce/*` (this run's PLAN/GRILL/reports). Those are **dev-loop
pipeline scaffolding**, not the build's outputs — the build's writes-scope hook permitted only the two
code files above. They are excluded from `--changed` by design; the fix #7 check ranges over the
build's real writes. (Observation for a human: `.pharn/` and `.dev/features/` are not gitignored, so
they surface as churn — a gitignore candidate, out of scope for this increment.)

## Per-gate exit codes (base → head)

Identical gate set both sides (required, else the helper fails inconclusive):

| gate | base (c44170e, clean worktree + `npm ci`) | head (working tree) | result |
| --- | --- | --- | --- |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 | 0 | OK |
| `floor-tests` (44 `.mjs`/`.cjs` via `node --test`; 663 tests) | 0 | 0 | OK |
| `vitest-outside` (`vitest run --exclude '**/fresh-check.test.ts'`; 505 tests) | 0 | 0 | OK |

`floor-tests` and `validate` are provably unaffected by a change confined to `src/steps/fresh-check.ts`
(they exercise the dev-loop helpers, not CLI src). `vitest-outside` is the gate that **could** flip —
it re-runs the entire CLI suite except the feature's own tests against the new `fresh-check.ts`. It is
green at both the base and the head, so the behavior-preserving hardening broke nothing outside the
feature.

- **`regressions[]`:** none
- **`pre_existing[]`:** none

## Verdict

**REGRESSIONS: none — no deterministically-detectable breakage outside the feature.** The stage does
not fail.

Residual (named, not hidden — P0/P7): `/pharn-dev-regress` catches **exactly what its suite catches — nothing
more.** Here that suite is `validate` + the 44-file floor test suite + the CLI vitest suite (minus the
feature). A regression that no deterministic check covers would be invisible. This certifies the
**comparison**, not that the increment is whole or wise — that is the human's call at the post-review
gate.
