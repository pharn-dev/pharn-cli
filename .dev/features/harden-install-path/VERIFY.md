# VERIFY — harden-install-path

**Verdict source:** `.dev/floor/check-verify.mjs` (exit `0`). Machine report: `verify-report.json`.

## FLOOR layer — deterministic gates (owns the verdict)

The gate set mirrors this repo's enforced floor — `npm run check` (`format:check → lint → typecheck → test`) plus the structural `validate`. `lint:md` is **not** part of pharn's `npm run check`/CI and its globs (`docs/**/*.md`, `*.md`) cover none of this increment's files, so it is not a verify gate here.

| gate           | exit | meaning                                             |
| -------------- | ---- | --------------------------------------------------- |
| `test`         | 0    | `vitest run` — 527 tests (incl. the new symlink/dev-product + pin/fallback cases) |
| `typecheck`    | 0    | `tsc --noEmit` (src + tests configs)                |
| `lint`         | 0    | `eslint src`                                        |
| `format:check` | 0    | `prettier --check`                                  |
| `validate`     | 0    | `.dev/floor/validate.mjs` (whole-repo; 0 markdown capabilities → vacuously GREEN) |

No `structural:*` gate — this increment ships no markdown-capability eval pair (it is TypeScript; its correctness signal is the `vitest` suite collected by `test`, and the one repo-level candidate — trust-fence — has no committed `expected`).

**VERIFIED: floor gates PASS.** `failing_gates`: none.

## ADVISORY layer — verifiers

`.dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}` — **no verifiers registered; floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone.

## Honest residual (P0/P7)

Verified = the named gates passed; this is **NOT** a guarantee of correctness beyond what those gates check — verifier concerns are advisory help, not assurance, and none exist today. The gates re-run the **whole repo** with the increment present (whole-repo green required), and the increment's own behavior is exercised by its `vitest` tests; a defect no test/lint/typecheck/validate covers is invisible to this verdict. The security invariants themselves are demonstrated by the new `install-modules.test.ts` cases (symlink root reject, nested-symlink skip, Layer-2 write-through refusal, dev/product exclusion) and `repo.test.ts` (pin == recorded, graceful fallback) — the verdict rests on those passing, not on a claim of general correctness.
