# VERIFY — floor-gate-action-pins

Machine report: `.dev/features/floor-gate-action-pins/verify-report.json`.

## FLOOR layer — the gates that own the verdict

| gate | exit |
| --- | --- |
| `test` (`npm test` — vitest, 625 tests) | 0 |
| `validate` (`validate.mjs .`) | 0 |
| `lint` (eslint over `src`) | 0 |
| `format:check` (prettier) | 0 |
| `lint:md` (markdownlint-cli2) | 0 |

`structural:*` — none (no `*/evals/expected/*.json` in this repo).

`node .dev/floor/check-verify.mjs … --feature floor-gate-action-pins` → **exit 0**, `"verdict": "PASS"`, `failing_gates: []`.

## ADVISORY layer — verifiers

`count-verifiers.mjs` → `{"registered":0,"verifiers":[]}`. **No verifiers registered — floor gates only.** No verifier free-text was produced.

## Feature-specific evidence (the part the gate table above does NOT cover)

`npm test` is vitest over `tests/**/*.ts` and does **not** collect `.mjs`, so **the increment's own 18 tests are invisible to the `test` gate in the table above.** Stating that plainly matters more than the green row. They were run directly, and the enforcement path was proven three ways:

1. **Its own suite:** `node --test .dev/floor/check-action-pins.test.mjs` → **18/18 pass**, including the ★ `# v6` historical-defect case and the ★ live repo-consistency assertion.
2. **Collection proof (by name, per `GRILL.md` F3 — not "absence of red"):** running floor.yml's exact command line, `grep` finds both `THIS repo: every workflow action ref` and `ff48077 defect` in the output; totals `684 = 666 baseline + 18`, exit 0. The gate really is collected by CI.
3. **True-negative proof:** a scratch copy of the real `.github/workflows/` returns exit 0; reintroducing `actions/setup-node@v7` into it returns **exit 1** with `{"file":".github/workflows/floor.yml","line":22,"ref":"actions/setup-node@v7","reason":"floating-ref"}`. The gate fails when it should, not merely passes when it should.

**A fail-open was found and fixed during the build.** The first implementation captured the ref with `(\S+)`, so a `${{ … }}` expression ref — which contains spaces — did not match the `uses:` pattern at all and was silently skipped rather than flagged. The `unpinnable-ref` test (written because of `GRILL.md` F2) caught it, the floor went RED, and the parser was changed to capture the whole remainder and split on `#`. Worth recording: the grill finding did not just improve wording, it surfaced a real defect in the gate itself.

## VERDICT

**VERIFIED: floor gates PASS.**

## The honest residual (P0/P7)

"Verified" means the five named gates passed — nothing more. Specific boundaries for this increment:

- **The checker enforces comment FORM, never comment TRUTH.** `# v7.0.0` is validated as full semver; that it actually names commit `8207627…` is not checked, because that needs `git ls-remote` and floor scripts are network-free. A digest bumped under a well-formed but wrong `# v6.4.0` still passes. This shrinks the recurrence surface; it does not close it.
- **The enforcement path has an unpinned dependency (`GRILL.md` F3):** floor.yml → `setup-node` (digest-pinned) → `node-version: lts/*` → that runtime's `node --test` glob expansion. `lts/*` is the out-of-axis follow-up this increment did not take. True today, verified today, not floor-locked forever.
- **`lint:md` covers `docs/**/*.md` + `*.md` only** — the `.dev/features/**` markdown this loop wrote is not style-gated by the passing `lint:md`.
- **`.dev/floor/**` is outside `format:check`'s globs** (`src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`), so the two new files' style is not gated either. They were matched to the 40+ sibling floor scripts by hand — see `REVIEW.md`, which records that Step 2b's "run the formatter" advice is actively wrong for this directory.

Nothing here should be read as "`/pharn-dev-verify` ensures the feature is correct."
