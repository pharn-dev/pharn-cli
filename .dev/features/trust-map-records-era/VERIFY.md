# VERIFY — trust-map-records-era

## FLOOR layer (owns the verdict)

| Gate | Command | Exit |
| --- | --- | --- |
| `test` | `npm test` (vitest — 41 files, 658 tests) | **0** |
| `validate` | `node .dev/floor/validate.mjs .` | **0** |
| `lint` | `npm run lint` (eslint, `--max-warnings 0`) | **0** |
| `format:check` | `npm run format:check` (prettier) | **0** |
| `lint:md` | `npm run lint:md` (markdownlint, 23 files) | **0** |

`structural:*` — **no gate.** This increment ships no eval pair (docs-only, no capability), so none
exists to run. Absent from the map by construction, not skipped.

**VERIFIED: floor gates PASS.** (`.dev/floor/check-verify.mjs` → `"PASS"`, `failing_gates: []`, exit 0.)

## ADVISORY layer (annotates; never flips the verdict)

`node .dev/floor/count-verifiers.mjs .` → `{"registered":0,"verifiers":[]}`.

**No verifiers registered — floor gates only.** Step 2 was a no-op, so no advisory findings were
produced and none could have reached the verdict helper regardless (fix #3: its only input is the
gate→exit-code map).

## A gate-set gap, stated rather than buried (P7)

`/pharn-dev-regress` measured the **46-file outside floor suite** (`node --test` over
`.dev/floor/*.test.mjs` + `.claude/hooks/*.test.cjs`) at **exit 1 — RED at both the baseline
(`3645fdf`) and HEAD**, hence its `pre_existing: ["tests"]` and verdict `no-regressions`.

**That suite is not in this stage's gate set.** Verify's `test` gate is `npm test`, which runs
**vitest** over `tests/*.test.ts` — a different suite. So:

- Nothing here is suppressed, and nothing here contradicts the regress report: the two stages ran
  **different** test commands, and both results are reported as measured.
- The floor's own `node --test` suite being RED on `main` is a **pre-existing repo condition**,
  untouched and uncaused by this increment (docs-only; zero executable files changed).
- It is therefore **outside** what this PASS covers. Worth a separate ticket; it is not this
  increment's to fix, and this stage does not claim it is fine.

## Residual (P0/P7)

**Verified = the named gates passed.** This is **NOT** a guarantee of correctness beyond what those
gates check — and for a prose increment that gap is unusually wide: no gate above can evaluate whether
a sentence in `LIMITS.md` is *true*. Markdown lints clean, the repo compiles, the suite is green — none
of which touches the claim being made. Prose correctness rests on the anchor table (`PLAN.md` D8, every
sentence mapped to a `file:line` verified live) and on human review. Both are explicitly **advisory**.

Verifier concerns would be advisory help, not assurance — and today there are none to offer.
