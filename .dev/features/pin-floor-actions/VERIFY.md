# VERIFY — pin-floor-actions

Machine report: `.dev/features/pin-floor-actions/verify-report.json` (helper stdout verbatim + the advisory `verifiers` block appended after the verdict was computed).

## FLOOR layer — the gates that own the verdict

| gate | exit |
| --- | --- |
| `test` (`npm test` — vitest, 625 tests / 39 files) | 0 |
| `validate` (`node .dev/floor/validate.mjs .`) | 0 |
| `lint` (eslint over `src`) | 0 |
| `format:check` (prettier) | 0 |
| `lint:md` (markdownlint-cli2) | 0 |

`structural:*` — **none.** No `*/evals/expected/*.json` exists in this repo, so the feature ships no eval pair and no `structural:*` gate is in the map (absent, not assumed-passing).

`node .dev/floor/check-verify.mjs .pharn/pharn-dev-verify/results.json --feature pin-floor-actions` → **exit 0**, `"verdict": "PASS"`, `failing_gates: []`.

## ADVISORY layer — verifiers

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 is a no-op; the verdict is the floor gates alone. No verifier free-text was produced, so no untrusted `problem` / `evidence` entered this report.

## VERDICT

**VERIFIED: floor gates PASS.**

## The honest residual — and it is unusually large for this increment (P0/P7)

"Verified" means **the five named gates passed, full stop.** It is not a guarantee of correctness beyond what those gates check. For *this* increment that gap deserves to be stated bluntly rather than buried in boilerplate:

- **Not one gate in the set reads `.github/workflows/**`.** `test` is vitest over `src`/`tests`; `lint` is eslint over `src`; `format:check`'s prettier globs are `src/**/*.ts`, `tests/**/*.ts`, `*.config.ts`; `lint:md` is `markdownlint-cli2 "docs/**/*.md" "*.md"`; `validate` walks capability frontmatter. **The three files this increment actually changed are invisible to every one of them.** A PASS here therefore certifies that the change *broke nothing already covered* — it says nothing whatsoever about whether the change itself is right.
- The evidence that the change is right lives elsewhere, and is owed at Phase C: (a) the digest↔tag equalities re-verified against `git ls-remote` at plan time, and (b) **the PR's own `floor` check running green** — floor.yml triggers on `pull_request`, so the PR run parses and executes the edited file. Per `GRILL.md` F3, that check must be asserted **by name and conclusion** (`gh pr checks` showing a `floor` row with a `pass` conclusion), because "no red checks" is also satisfied by a PR where an unparseable workflow never produced a check at all.
- **Granularity note (L9-adjacent):** `lint:md`'s glob is `docs/**/*.md` + `*.md`, which does **not** cover `.dev/features/**/*.md`. The markdown artifacts this loop wrote (`PLAN.md`, `GRILL.md`, `REGRESSION.md`, this file) are therefore **not** style-gated by the passing `lint:md`. Recorded so the green is not read as broader than it is.

Verifier concerns would be advisory help, not assurance — and there are none, because there are no verifiers. Nothing here should be read as "`/pharn-dev-verify` ensures the feature is correct."
