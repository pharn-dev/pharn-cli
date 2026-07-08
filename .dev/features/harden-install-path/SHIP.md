# SHIP — harden-install-path

**Mode:** gated `/pharn-dev-ship` (no `--loop`). **Run ended at:** GATE 2 (post-review human decision) — no RED-verdict STOP occurred.

## Stages run, in order

| # | stage             | outcome                                                                 |
| - | ----------------- | ----------------------------------------------------------------------- |
| 1 | `/pharn-dev-plan`     | PLAN.md written; **GATE 1** — human approved as written (bundle all three fixes; graceful SHA fallback) |
| 2 | `/pharn-dev-grill`    | GRILL.md — advisory, 0 blocking (gates nothing); proceeded              |
| 3 | `/pharn-dev-build`    | 11 files written; floor GREEN                                           |
| 4 | `/pharn-dev-regress`  | regression-report.json — clean                                          |
| 5 | `/pharn-dev-verify`   | verify-report.json — PASS                                               |
| 6 | `/pharn-dev-review`   | REVIEW.md — GREEN (no blocking), 5 advisory findings; **GATE 2**        |

## Structural floor verdicts read (verbatim — the basis for proceeding past each stage)

- **`/pharn-dev-build`** → `node .dev/floor/validate.mjs .` exit code = **`0`** (GREEN). _(Also: the repo floor `npm run check` — format:check, lint, typecheck, test — GREEN; 527 tests.)_
- **`/pharn-dev-regress`** → `regression-report.json` `.verdict` = **`"no-regressions"`** (`check-regress.mjs` exit 0; no outside gate flipped pass→fail).
- **`/pharn-dev-verify`** → `verify-report.json` `.verdict` = **`"PASS"`** (`check-verify.mjs` exit 0; gates test/validate/lint/format:check/typecheck all 0; 0 verifiers registered → floor-only).

Each proceed decision was read from the named floor verdict above, never from agent judgment (P5). No stage came back non-GREEN, so the run reached GATE 2 rather than a RED-verdict STOP.

## Advisory artifacts (cited, not restated — P4)

- **`REVIEW.md`** — GREEN, no floor-gate findings; **5 advisory findings** for the human. The most actionable: **finding 1 (P2, `src/lib/repo.ts:83`)** — FIX 1 routes the untrusted GitHub-API `sha` into the degit ref without a format allowlist; bounded by degit's incidental ref resolution, but against the repo's P2 posture; cheap fix = validate against `/^[0-9a-f]{7,40}$/`. See `REVIEW.md` for all five.
- **`GRILL.md`** — advisory (gated nothing): 0 blocking, 2 important (FIX 1 guarantee-wording precision + fail-closed untested), 2 minor. Both important findings were reflected in the built code (repo.ts states the invariant precisely and scopes fail-closed as degit behavior).

## The standing decision is the human's (GATE 2)

What landed: FIX 2 (symlink-escape defense — the verified arbitrary-write hole) + FIX 3 (dev/product allowlist) on the legacy `install-modules.ts` path, and FIX 1 (resolve-then-pin `degit(#sha)` with graceful fallback) across `repo.ts` + four callers — all on the **default/live** install path, with demonstrating tests.

The chain ran; the named floor verdicts are as shown — **this is NOT a judgment that the increment is good or wise; that is the human's call at the post-review gate.** `/pharn-dev-ship` does not merge, push, commit, or apply the `PHARN ✓ reviewed` seal. Options: **merge / fix (e.g. address REVIEW finding 1) / abandon.**
