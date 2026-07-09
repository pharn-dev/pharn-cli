# VERIFY — archetype-path-context (re-verified after GATE-2 fix)

**Verdict (FLOOR, `check-verify.mjs`):** `VERIFIED: floor gates PASS` — exit `0`.

Re-run after the human-directed GATE-2 fix iteration (P3 classifier extraction + P1 coverage). The
deterministic gates over the repo-with-the-fix all pass. "verified" = these gates passed — nothing more.

## FLOOR layer — deterministic gates (own the verdict)

| gate           | exit | what it covers |
| -------------- | ---- | -------------- |
| `test`         | 0    | vitest suite (**594 passed**; +28 from the extracted-classifier unit tests + `app/api` case) |
| `validate`     | 0    | `.dev/floor/validate.mjs .` structural floor (GREEN — vacuous) |
| `lint`         | 0    | eslint clean over `src` (incl. the moved `classifyEntry` in `archetype.ts`) |
| `format:check` | 0    | prettier clean (whole-repo) |
| `lint:md`      | 0    | markdownlint clean |

`verdict: PASS` · `failing_gates: []`. Gate set = the repo's full `npm run check` surface (L9).

## ADVISORY layer — verifiers

`count-verifiers.mjs .` → `{"registered":0}` — **no verifiers registered; floor gates only.**

## Fix iteration — what changed since the first verify

- **P3 (REVIEW):** `classifyEntry` + `SQL_HOST_DIRS`/`NON_UI_DIRS`/`TEST_FIXTURE_RE` **extracted** from the
  I/O file `detect-archetype.ts` to the pure-rules file `archetype.ts` (beside `packageSignals`), exported;
  `detect-archetype.ts` now imports it and owns only the walk + package read. The file header's stated
  axis ("pure classification rules stay next door in archetype.ts") now holds.
- **P1 (REVIEW):** direct `classifyEntry` unit tests added in `tests/archetype.test.ts` covering every
  branch incl. the cited gaps (`app/api` parent, `route.js`/`route.mjs`, a deep DB location); one `app/api/`
  integration case added in `tests/detect-archetype.test.ts`.

## Honest residual (P0/P7)

Verified = the named gates passed; NOT a guarantee of correctness beyond what those gates check. The
extraction preserves behavior (public `detectArchetypesFromProject` unchanged; every prior integration
test still green), and the new unit tests pin the pure classifier directly.
