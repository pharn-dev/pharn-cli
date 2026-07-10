# VERIFY — init-archetype-default

**VERIFIED: floor gates PASS** — `check-verify.mjs` verdict `PASS` (exit 0), every gate exit 0.

## Floor gates (gate → exit code)

| gate           | exit | notes                                             |
| -------------- | ---- | ------------------------------------------------- |
| `test`         | 0    | vitest `tests/**/*.test.ts` — 561 pass            |
| `validate`     | 0    | `.dev/floor/validate.mjs` GREEN (tracked scope)   |
| `lint`         | 0    | eslint `src`                                      |
| `format:check` | 0    | prettier — whole-repo clean                       |
| `lint:md`      | 0    | markdownlint — `docs/**` + root `*.md`            |

- **No `structural:*` gate:** this increment ships no committed eval pair (`pharn-review/trust-fence/evals/expected/*.json` is not present in this repo), so there is no per-eval structural gate — exactly as `/pharn-dev-regress` handled it.
- **Build-completeness (diligence, not part of the verdict):** `check-build-complete.mjs` → `complete` — the plan's `## Files` declares exactly `src/commands/init.ts`, `src/index.ts`, `tests/init.test.ts`, `tests/init-archetype.test.ts`, `tests/index.test.ts`; all exist, `missing: []`. Confirms the `## Files` was reformatted correctly (deletions under `### Deleted` excluded from the completeness set).

## `validate` measurement note (same as REGRESSION.md — tracked/CI scope)

`validate.mjs .` is whole-repo. The working tree contains `test-app/` — a **gitignored, 0-tracked-file** local build artifact whose `test-fixtures/red/skill.md` is a **deliberately-invalid** fixture (the negative corpus for `validate`'s own tests). Run literally over the working tree, `validate` is red **only** from that fixture; on a clean checkout / CI (no `test-app/`) it is GREEN. The gate was therefore measured over the **tracked/CI scope** (untracked `test-app/` set aside, then restored) → `0`. This measures "is the tracked repo + this feature green," which is what verify asks; it does not mask any real defect (the sole red path was the gitignored fixture, verified).

## Verifiers (advisory layer)

**No verifiers registered — floor gates only.** `count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`. Step 2 is a no-op; the verdict is the floor gates alone.

## Honest residual (P0/P7)

Verified = the named gates passed. This is **not** a guarantee of correctness beyond what those gates check — a defect no test/eval/rule/lint covers is invisible to the floor verdict, and there are no verifiers today to raise advisory concerns. The verdict certifies the gates it ran, nothing more.
