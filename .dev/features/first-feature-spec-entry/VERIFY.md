# VERIFY — first-feature-spec-entry

**VERIFIED: floor gates PASS** (`check-verify.mjs` verdict `PASS`, every gate exit 0). Stage PASSES.

## Floor layer (owns the verdict)

| gate | exit | scope |
|------|------|-------|
| `test` (vitest, incl. the new `tests/constants.test.ts`) | 0 | whole suite — 386 tests |
| `validate` (`validate.mjs`, structural floor) | 0 | tracked repo **with the feature** (CI-equivalent) |
| `lint` (eslint `src`) | 0 | `src/` |
| `format:check` (prettier) | 0 | `src/**`, `tests/**`, `*.config.ts` |
| `lint:md` (markdownlint) | 0 | `docs/**/*.md`, `*.md` |

No `structural:*` gate — this increment ships **no** eval-actual pair (it adds no capability, only a TS constant + docs + a vitest test), exactly as `/pharn-dev-regress` handles it.

### Honest note on the `validate` gate (measured CI-equivalent, not raw)

`validate.mjs .` returns **1 in the raw working tree**, but *only* because the **gitignored `test-*/` sample apps** (created locally by `npm run build:install-local`) contain intentional `test-fixtures/red/skill.md` fixtures, and `validate.mjs` walks the whole directory tree with no gitignore awareness. A clean checkout — which is what CI and a fresh clone see — has **no** `test-*/`, so `validate` is GREEN there. To measure the gate honestly (the tracked repo *with this feature in it*), it was run in a clean `git worktree` at HEAD with the feature's 6 tracked edits `git apply`-ed and the new test copied in → **exit 0** (feature confirmed present in the worktree). The feature is provably **validate-disjoint**: none of its 7 files declares `role:` frontmatter or is a `pharn-*.md` capability, so `validate.mjs` never reads them. The raw `= 1` is gitignored local build-scratch, not a defect in the tracked repo or this feature. (The other four gates are scoped to `src`/`docs`/`tests` and never reach `test-*/`, so they were measured directly in the working tree.)

## Advisory layer (verifiers)

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone (P7 — no verifier is authored speculatively).

## Residual (P0/P7, named not hidden)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check — verifier concerns (none exist yet) would be advisory help, not assurance. A defect no test/eval/rule/lint covers is invisible to this verdict.
