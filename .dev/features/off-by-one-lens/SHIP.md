# SHIP — off-by-one-lens (gated `/pharn-dev-ship` roll-up, advisory)

**Increment:** an off-by-one review lens — `pharn-review/off-by-one/` (the `role: lens`) backed by the deterministic `.dev/floor/scan-code-off-by-one.mjs` `<= <expr>.length` shape scanner (a REAL PARTIAL FLOOR), boundary-correctness judgment kept ADVISORY.

**Run ended at: GATE 2 (post-review human decision).** No RED-verdict STOP occurred — every stage's structural floor verdict came back GREEN, so the chain ran to the end and now hands to the human.

## Stages run, in order, with the structural verdict read at each (verbatim)

| stage                | what ran                                      | structural verdict read                                                 | source                   |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `/pharn-dev-plan`    | scoped the increment, pinned spec-hash        | **GATE 1 — approved** (human: narrow scanner + approve as written)      | interactive gate         |
| `/pharn-dev-grill`   | interrogated PLAN.md (advisory)               | 4 concerns (0 blocking, 1 important, 3 minor) — **gates nothing**       | `GRILL.md`               |
| `/pharn-dev-build`   | wrote the 12 planned files, ran the floor     | `validate.mjs` exit **0** (GREEN — 29 capabilities)                     | floor exit code          |
| `/pharn-dev-regress` | re-ran outside gates at base `e1d9e32` + HEAD | `.verdict` = **`no-regressions`**                                       | `regression-report.json` |
| `/pharn-dev-verify`  | re-ran project gates at HEAD                  | `.verdict` = **`PASS`** (test/validate/lint/format:check/lint:md all 0) | `verify-report.json`     |
| `/pharn-dev-review`  | 4 advisory lenses, floor-first                | GREEN — **0 floor-gate findings**, 2 advisory                           | `REVIEW.md`              |

## Standing floor verdicts (the proceed decisions were read from these, never from judgment)

- **build:** `node .dev/floor/validate.mjs .` → exit **0** (GREEN, 29 capabilities).
- **regress:** `regression-report.json` `.verdict` = **`no-regressions`** (scope check `escaped: []`; tests/validate/structural:trust-fence all `0/0` base→head; style gates skipped — no shared config touched).
- **verify:** `verify-report.json` `.verdict` = **`PASS`** (0 verifiers registered → floor gates only; `failing_gates: []`).

## Advisory artifacts (cited, not restated — P4)

- **`.dev/features/off-by-one-lens/REVIEW.md`** — the 4 advisory lenses (verdict GREEN, 0 blocking); 2 advisory findings (deferred live-eval; documented backtick false-positive) + a **proposed lesson** (zsh word-splitting in pipeline Bash — for a separate human-gated `/pharn-dev-memory-promote`, not written to canon here).
- **`.dev/features/off-by-one-lens/GRILL.md`** — advisory interrogation; its 4 concerns were folded into the build (findings-only-on-scanner-hits provenance; clean-case `semantic[]`; self-contained scanner-test fixtures; P7 capability-trigger note).

## Honest scope (P0)

The gated `/pharn-dev-ship` added **no new floor primitive** — every guarantee above belongs to a **sub-stage** (`validate` / `check-regress` / `check-verify` / the writes-scope hooks / `/pharn-dev-build`'s spec-hash re-check). Running the stages in order is **advisory orchestration**; only the named **verdicts** are floor-grade.

**Chain ran; the named floor verdicts are as shown — this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or apply the `PHARN ✓ reviewed` seal.
