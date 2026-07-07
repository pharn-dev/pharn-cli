# VERIFY — hook-symlink-escape

Deterministic verdict (FLOOR; `.dev/floor/check-verify.mjs`): **VERIFIED: floor gates PASS.** Verdict exit `0`.

## FLOOR gates (run once at HEAD; PASS iff every gate exit 0)

| Gate           | exit | meaning                                                     |
| -------------- | ---- | ----------------------------------------------------------- |
| `test`         | 0    | full `npm test` suite green (incl. the 7 new symlink cases) |
| `validate`     | 0    | `validate.mjs .` GREEN (product surface structurally valid) |
| `lint`         | 0    | eslint clean                                                |
| `format:check` | 0    | prettier clean (whole repo)                                 |
| `lint:md`      | 0    | markdownlint clean (whole repo)                             |

- **failing_gates:** none
- The feature ships **no new eval pair**, so there is no `structural:*` gate; its correctness signal is
  its own `*.test.cjs` cases, collected by `npm test` (the `test` gate above).

## ADVISORY layer — verifiers

**No verifiers registered — floor gates only** (`count-verifiers.mjs` → `{"registered":0}`). Step 2 is a
no-op; the verdict is the floor gates alone. No verifier is authored speculatively (P7).

## Method note (honest)

A first verify run recorded `format:check: 1` / `lint:md: 1` — **not** an increment defect: the regress
stage's hand-written `REGRESSION.md` table used inconsistent column padding (prettier alignment vs
markdownlint `MD060` compact style). Formatting that artifact made the whole repo style-clean; the `test`
/ `validate` / `lint` gates were green throughout. The verdict above is from the clean re-run.

## Honest residual (P0/P7)

Verified = the named gates passed; this is **not** a guarantee of correctness beyond what those gates
check — a defect no test/eval/rule/lint covers is invisible to the floor verdict, and there are zero
verifiers to (advisorily) notice it. The symlink-escape fix's real assurance is its seven exit-code
assertions in the two hook suites (leaf symlink → deny, parent-dir symlink → deny, out-of-scope symlink
→ deny, in-scope symlink → allow, real files → allow) plus the unchanged 654 prior tests.
