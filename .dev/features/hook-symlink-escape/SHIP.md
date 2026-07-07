# SHIP — hook-symlink-escape (advisory roll-up)

`/pharn-dev-ship` (gated) ran the build loop in order and **stopped at GATE 2** (post-review) for the
human's merge / fix / abandon decision. No `--loop`, no auto-act. This file records **that the chain ran
and its floor verdicts** — it is **not** a "shipped", an approval, or a `PHARN ✓ reviewed` seal.

## Stages run, in order, and where it ended

1. **/pharn-dev-plan** → `PLAN.md` written; **GATE 1** (plan approval) — human approved _as written_, and
   resolved the one open question (resolver depth → **nearest-existing-ancestor walk**).
2. **/pharn-dev-grill** → `GRILL.md` (advisory; gates nothing). Surfaced 1 important + 4 minor concerns;
   the important one (a still-open-looking `## Open questions (HALT)` section that would HALT build) was
   reconciled by recording the GATE-1 resolution into `PLAN.md` before build.
3. **/pharn-dev-build** → wrote the 6 planned files; floor gate GREEN.
4. **/pharn-dev-regress** → `regression-report.json` + `REGRESSION.md`.
5. **/pharn-dev-verify** → `verify-report.json` + `VERIFY.md`.
6. **/pharn-dev-review** → `REVIEW.md`. **GATE 2** — this stop.

## Structural verdicts read, verbatim (the floor clock — what proceed/stop rested on)

- **/pharn-dev-build** → `node .dev/floor/validate.mjs .` exit **0** (GREEN) → proceeded. (Also, not a ship
  gate but the increment's real signal: `npm test` 661 pass / 0 fail incl. 7 new symlink cases.)
- **/pharn-dev-regress** → `regression-report.json` `.verdict` = **"no-regressions"** (exit 0) → proceeded.
  Outside gates (42 tests, `validate`, trust-fence `structural`) GREEN at base `b4b7000` and at HEAD;
  `escaped: []` (build stayed inside its `## Files`). One capture bug (a zsh word-split that made the
  `tests` gate falsely `1/1`) was caught and re-run correctly before the verdict was recorded.
- **/pharn-dev-verify** → `verify-report.json` `.verdict` = **"PASS"** (exit 0) → proceeded. Gates
  `test`/`validate`/`lint`/`format:check`/`lint:md` all 0; zero verifiers registered (floor-only). A
  first pass FAILed on `format:check`/`lint:md` due to an unformatted `REGRESSION.md` table (confirms
  L9); fixed by hand, re-run PASS.

## Pointers (cite, do not restate — P4)

- **`.dev/features/hook-symlink-escape/REVIEW.md`** — 4 advisory lenses. Verdict **GREEN**: no floor-gate
  (blocking) findings; 3 advisory minors (P0 comment-residual, P3 two-reason header, P7 bundling).
- **`.dev/features/hook-symlink-escape/GRILL.md`** — advisory interrogation (spec-hash matched).

## The standing decision is the human's

The chain ran; the named floor verdicts are as shown (build `validate` exit 0; regress
`no-regressions`; verify `PASS`) — this is **NOT** a judgment that the increment is good or wise; that
is the human's call at the post-review gate. `/pharn-dev-ship` does not merge, push, or seal.
