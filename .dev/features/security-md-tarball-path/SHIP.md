# SHIP — `security-md-tarball-path`

Gated `/pharn-dev-ship` run (no `--loop`). Base `377e1f5`, branch `docs/security-md-tarball-path`.

## Stages run, in order

| # | stage | outcome |
| --- | --- | --- |
| 1 | `/pharn-dev-plan` | `PLAN.md` written; **GATE 1** satisfied by the human's standing pre-approval, whose condition (stay within the stated minimal fix) was checked and holds — 2 files, no `src/`, no tests, no changelog restructuring |
| 2 | `/pharn-dev-grill` | `GRILL.md` — 5 advisory findings (0 blocking). Advisory by design; gates nothing |
| 3 | `/pharn-dev-build` | files written; floor run |
| 4 | `/pharn-dev-regress` | `regression-report.json` + `REGRESSION.md` |
| 5 | `/pharn-dev-verify` | `verify-report.json` + `VERIFY.md` |
| 6 | `/pharn-dev-review` | `REVIEW.md` — 0 floor-gate findings; 2 advisory findings fixed in place |

**Ended at: GATE 2** — the post-review human decision. No stage returned a non-GREEN verdict, so the
chain was never STOPped.

## Structural verdicts read (verbatim — these, not judgment, decided each proceed)

| stage | verdict source | value |
| --- | --- | --- |
| `/pharn-dev-build` | `node .dev/floor/validate.mjs .` exit code | **0** (`FLOOR: GREEN`) |
| `/pharn-dev-regress` | `regression-report.json` `.verdict` | **`no-regressions`** |
| `/pharn-dev-verify` | `verify-report.json` `.verdict` | **`PASS`** (`failing_gates: []`) |

Supporting: `npm run check` exit **0** (format:check, lint, lint:md, typecheck, test — 56 files,
1122 tests); `check-regress.mjs scope` exit **0** with `escaped: []`, so the build did not write
outside its declared `## Files` (no fix #7 breach); `count-verifiers` → 0 registered, so
`/pharn-dev-verify`'s advisory layer was a no-op and the verdict is floor gates alone.

**Re-measured after the in-review fixes.** `/pharn-dev-review` raised two advisory findings that were
corrected inside the plan's declared `## Files` (`SECURITY.md`), so every verdict above was
**recomputed against the final tree**: `npm run check` exit 0, `validate.mjs` exit 0,
`check-regress.mjs verdict` exit 0, `check-verify.mjs` exit 0. The three verdicts as stated describe
what is on disk now, not an earlier tree.

## Pointers (cited, not restated — P4)

- `.dev/features/security-md-tarball-path/REVIEW.md` — the review, its 5 advisory findings, and a
  proposed memory-bank candidate (recorded only; canon is written exclusively by a separate,
  human-gated `/pharn-dev-memory-promote` run).
- `.dev/features/security-md-tarball-path/GRILL.md` — advisory; F1 (no gate reads `SECURITY.md`) was
  **deferred as scope growth**, F2/F3/F4 were adopted into the build.
- `.dev/features/security-md-tarball-path/{REGRESSION,VERIFY}.md` — the human renders of the two floor
  verdicts, each carrying its own residual note.

## One thing the human should weigh at this gate

Both `/pharn-dev-grill` and `/pharn-dev-review` independently raised the same gap: **no deterministic
gate reads `SECURITY.md`'s prose**, so the drift this increment repairs can recur silently. It was
deferred here because a new test is growth beyond the approved minimal fix — not because it was judged
unnecessary. It is the top follow-up, and `REVIEW.md` carries it as a proposed lesson with provenance.

---

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is
good or wise; that is the human's call at the post-review gate.** No merge, no push of `main`, no
`PHARN ✓ reviewed` seal was applied by this run.
